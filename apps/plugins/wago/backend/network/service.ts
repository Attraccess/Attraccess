import {
  type PluginAuditPrincipal,
  type PluginContext,
  type PluginMqttSubscription,
} from '@attraccess/plugins-backend-sdk';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';

import { randomBytes, createHash, randomUUID } from 'node:crypto';

import { WagoAudit } from '../audit/index';

import { WagoController } from '../controllers/entity';

import { WagoCredentialRotationEntity } from '../credentials/service';

import { WagoDeviceOperations } from '../runtime/device-operations';

import { WagoDeviceOperation, WagoManagedAccess, WagoRuntimeUpdateEntity } from '../runtime/managed/access.entity';

import { WagoManagedRuntimeService } from '../runtime/managed/service';

import { WagoNetworkChange, WagoMqttCredentialRetirement } from './entity';

import { NetworkChangeError } from './model';

import { networkChangeInput } from './model';

import { OPERATION_MS } from './model';

import { RuntimeUpdateError } from '../runtime/update/coordinator';

import { WagoService } from '../controllers/service';

import { normalizeOperationalPrefix } from '../protocol/index';

import { NetworkPayload } from './model';

import { EVIDENCE_MS } from './model';

import { WagoCommissioningSession } from '../commissioning/sessions/session.entity';

import { assertCommissioningBroker } from '../commissioning/delivery/preflight';

import { lookup } from 'node:dns/promises';

export { networkChangeInput } from './model';

@Injectable()
export class WagoNetworkChangeService implements OnModuleDestroy {
  public constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) protected readonly context: PluginContext,
    @Inject(WagoManagedRuntimeService) protected readonly managed: WagoManagedRuntimeService,
    @Inject(WagoService) protected readonly wago: WagoService,
  ) {}

  protected readonly active = new Set<AbortController>();

  protected destroyed = false;

  async apply(controllerId: number, body: unknown, principal: PluginAuditPrincipal, retry = false) {
    if (this.destroyed) throw new ConflictException('Controller operation has stopped. Retry the request.');
    const input = retry ? null : networkChangeInput(body);
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId, state: 'managed' }, order: { sessionId: 'DESC' } });
    if (!access) throw new ConflictException('Automatic SSH management is required for this operation.');
    const operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
    const owner = randomBytes(16).toString('hex'),
      now = Date.now();
    if (!(await operations.acquire(access.fingerprint, owner, now, now + OPERATION_MS + 60_000)))
      throw new ConflictException('Another controller operation is active. Retry after it finishes.');
    const abort = new AbortController();
    this.active.add(abort);
    const timer = setTimeout(() => abort.abort(), OPERATION_MS).unref();
    const assertOwned = async () => {
      abort.signal.throwIfAborted();
      await operations.assertOwned(access.fingerprint, owner);
    };
    let row: WagoNetworkChange | null = null;
    let audited = false;
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'network_change');
    try {
      const controller = await this.context
        .getRepository(WagoController)
        .findOneBy({ id: controllerId, trustState: 'claimed' });
      if (!controller?.mqttServerId || !controller.credentialEpoch)
        throw new ConflictException('Managed enrolled controller required.');
      row = await this.repository
        .createQueryBuilder('change')
        .addSelect('change.encryptedPayload')
        .where('change.controllerId = :controllerId', { controllerId })
        .getOne();
      if (retry && (!row || row.phase === 'completed')) return this.status(controllerId);
      if (!retry && row && row.phase !== 'completed' && !(row.phase === 'connecting' && row.failure))
        throw new ConflictException('Retry the pending MQTT/address change before starting another.');
      const rotation = await this.context.getRepository(WagoCredentialRotationEntity).findOneBy({ controllerId });
      const update = await this.context.getRepository(WagoRuntimeUpdateEntity).findOneBy({ controllerId });
      if ((rotation && rotation.phase !== 'completed') || (update?.metadata && JSON.parse(update.metadata).token))
        throw new ConflictException(
          'Finish credential rotation or runtime update recovery before changing MQTT/address settings.',
        );
      if (!retry) {
        if (!input) throw new BadRequestException('Invalid MQTT/address change');
        row = this.repository.create({
          controllerId,
          sessionId: access.sessionId,
          fingerprint: access.fingerprint,
          ...input,
          phase: 'connecting',
          failure: null,
          encryptedPayload: null,
          updatedAt: new Date().toISOString(),
        });
        await assertOwned();
        await this.repository.save(row);
      }
      if (!row || row.sessionId !== access.sessionId || row.fingerprint !== access.fingerprint)
        throw new ConflictException('Pending change belongs to another managed identity.');
      await lifecycle.attempt();
      audited = true;
      await assertOwned();
      if (row.mqttServerId !== null && !this.context.mqtt.refreshConnection)
        throw new NetworkChangeError('host_connection');
      const host = await this.managed.networkManagement(controllerId, row.targetHost, abort.signal);
      if (host.hardwareId !== controller.hardwareId) throw new RuntimeUpdateError('management_required');
      // The helper was already verified before saving a credential payload. A
      // retry may find no container after DELETE succeeded and CREATE failed;
      // proof + the retained helper/journal must suffice to recreate it.
      if (!row.encryptedPayload) await host.prepare();
      if (row.mqttServerId !== null) {
        await this.applyBrokerChange(controllerId, row, controller, host, abort, assertOwned, retry);
      } else {
        if ((await host.command(`mqtt-address ${host.managementToken}`)) !== 'OK\n')
          throw new RuntimeUpdateError('recovery');
        await this.phase(row, 'saving', assertOwned);
        await this.saveBindings(row, host.encryptedCredentials, null, assertOwned);
      }
      row.encryptedPayload = null;
      await this.phase(row, 'completed', assertOwned);
      if (row.mqttServerId !== null) this.managed.networkChanged(controllerId);
      await lifecycle.finish('succeeded');
      audited = false;
      return this.status(controllerId);
    } catch (error) {
      // Neither provider errors, SSH output nor decrypted envelopes cross this
      // boundary. The durable intent stays available to an explicit retry.
      if (row && row.phase !== 'completed') {
        row.failure =
          error instanceof RuntimeUpdateError || error instanceof NetworkChangeError ? error.failure : 'interrupted';
        await assertOwned()
          .then(() => this.repository.save(row))
          .catch(() => undefined);
      }
      if (audited) await lifecycle.finish('failed');
      throw new ConflictException('MQTT/address change is incomplete. Check its status and retry the saved operation.');
    } finally {
      clearTimeout(timer);
      abort.abort();
      this.active.delete(abort);
      await operations.release(access.fingerprint, owner);
    }
  }

  protected async applyBrokerChange(
    controllerId: number,
    row: WagoNetworkChange,
    controller: WagoController,
    host: Awaited<ReturnType<WagoManagedRuntimeService['networkManagement']>>,
    abort: AbortController,
    assertOwned: () => Promise<void>,
    retry: boolean,
  ): Promise<void> {
    let superseded: NetworkPayload | undefined;
    let connection: Awaited<ReturnType<WagoNetworkChangeService['brokerConnection']>> | undefined;
    if (retry && row.phase === 'verifying' && row.encryptedPayload) {
      const previous = this.payload(row, controller);
      connection = await this.brokerConnection(row.mqttServerId);
      if (Object.entries(connection).some(([key, value]) => previous[key as keyof NetworkPayload] !== value)) {
        // Verification means the previous helper finished applying. An
        // interrupted recreation must first finish its exact saved intent;
        // only this settled device state can adopt corrected broker details.
        await host.prepare();
        superseded = previous;
      }
    }
    if (!row.encryptedPayload || superseded) {
      // Keep the previous verification intent intact until the replacement
      // credentials and predecessor digest have been encrypted durably.
      if (!superseded) await this.phase(row, 'provisioning', assertOwned);
      connection ??= await this.brokerConnection(row.mqttServerId);
      const prefix = normalizeOperationalPrefix((await this.wago.getSettings()).operationalPrefix);
      const identity = `wago-controller-${controller.hardwareId}`,
        root = `${prefix}/v1/controllers/${controller.hardwareId}`;
      await assertOwned();
      const credential = await this.context
        .getMqttCredentialProvisioning()
        .provision({
          mqttServerId: row.mqttServerId,
          identity,
          username: identity,
          vhost: '/',
          topicPolicy: {
            publish: [`${root}/#`],
            subscribe: [`${root}/configuration/desired`, `${root}/commands`, `${root}/credentials/rotate`],
          },
        })
        .catch(() => {
          throw new NetworkChangeError('broker_provisioning');
        });
      if (
        !('password' in credential) ||
        credential.username !== identity ||
        !credential.password ||
        credential.password.length > 4096 ||
        /[\r\n\0]/.test(credential.password)
      )
        throw new NetworkChangeError('broker_provisioning');
      const payload: NetworkPayload = {
        schema: 1,
        controllerId,
        sessionId: row.sessionId,
        fingerprint: row.fingerprint,
        targetHost: row.targetHost,
        mqttServerId: row.mqttServerId,
        previousServerId: controller.mqttServerId,
        previousEpoch: controller.credentialEpoch,
        hardwareId: controller.hardwareId,
        operationToken: randomBytes(16).toString('hex'),
        credentialEpoch: randomUUID(),
        token: randomBytes(32).toString('base64url'),
        prefix,
        username: identity,
        password: credential.password,
        ...connection,
        ...(superseded
          ? { supersededDigest: createHash('sha256').update(JSON.stringify(superseded)).digest('hex') }
          : {}),
      };
      const plaintext = JSON.stringify(payload),
        encrypted = this.context.secrets.encrypt(plaintext);
      if (!encrypted || encrypted === plaintext || this.context.secrets.decrypt(encrypted) !== plaintext)
        throw new RuntimeUpdateError('management_required');
      row.encryptedPayload = encrypted;
      await this.phase(row, 'applying', assertOwned);
    }
    const payload = this.payload(row, controller);
    const bytes = Buffer.from(JSON.stringify(payload)),
      digest = createHash('sha256').update(bytes).digest('hex');
    // Subscribe before the recreation; a unique unguessable token and new
    // epoch exclude stale retained acknowledgements from earlier operations.
    const evidence = row.phase === 'saving' ? null : await this.evidence(payload, abort.signal);
    try {
      if (evidence) {
        await this.phase(row, 'applying', assertOwned);
        if (
          payload.supersededDigest &&
          (await host.command(`mqtt-release ${host.managementToken} ${payload.supersededDigest} ${digest}`)) !== 'OK\n'
        )
          throw new RuntimeUpdateError('recovery');
        if ((await host.command(`mqtt-apply ${host.managementToken} ${digest} ${bytes.length}`, bytes)) !== 'OK\n')
          throw new RuntimeUpdateError('recovery');
        await this.phase(row, 'verifying', assertOwned);
        await evidence.wait();
        await this.phase(row, 'saving', assertOwned);
      }
      await assertOwned();
      await this.saveBindings(row, host.encryptedCredentials, payload, assertOwned);
      if ((await host.command(`mqtt-ack ${host.managementToken} ${digest}`)) !== 'OK\n')
        throw new RuntimeUpdateError('recovery');
      await this.wago.refreshNetworkConnection(controllerId);
    } finally {
      evidence?.close();
    }
  }

  protected async evidence(payload: NetworkPayload, signal: AbortSignal) {
    if (!this.context.mqtt.refreshConnection) throw new NetworkChangeError('host_connection');
    const topic = `${payload.prefix}/v1/controllers/${payload.hardwareId}/credentials/rotate/ack`;
    let subscription: PluginMqttSubscription | undefined,
      closed = false,
      verified = false;
    let resolve!: () => void, reject!: () => void;
    const ready = new Promise<void>((ok, fail) => {
      resolve = ok;
      reject = () => fail(new NetworkChangeError('broker_verification'));
    });
    // A failed SSH command may never wait on this promise.
    void ready.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    signal.addEventListener('abort', reject, { once: true });
    const close = () => {
      closed = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', reject);
      subscription?.unsubscribe();
    };
    try {
      // A same-server refresh must not use a connected or reconnecting client
      // that captured this Attraccess server ID's previous address/credentials.
      await this.context.mqtt.refreshConnection(payload.mqttServerId);
      signal.throwIfAborted();
      // Clear an earlier attempt's retained receipt before subscribing. Every
      // verification attempt needs a newly published authenticated device proof.
      await this.context.mqtt.publish(payload.mqttServerId, topic, '', { qos: 1, retain: true });
      subscription = await this.context.mqtt.subscribe(payload.mqttServerId, topic, (message) => {
        if (
          closed ||
          signal.aborted ||
          message.serverId !== payload.mqttServerId ||
          message.topic !== topic ||
          message.payload.length > 1024
        )
          return;
        try {
          const ack = JSON.parse(message.payload.toString('utf8'));
          if (
            ack.credentialEpoch === payload.credentialEpoch &&
            ack.token === payload.token &&
            ack.revision === 1 &&
            ack.status === 'reconnected'
          ) {
            verified = true;
            resolve();
          }
        } catch {
          /* untrusted broker message */
        }
      });
      if (signal.aborted) reject();
      return {
        wait: () => {
          timer = setTimeout(reject, EVIDENCE_MS).unref();
          return verified ? Promise.resolve() : ready;
        },
        close,
      };
    } catch {
      close();
      throw new NetworkChangeError('broker_verification');
    }
  }

  protected async saveBindings(
    row: WagoNetworkChange,
    encryptedCredentials: string,
    payload: NetworkPayload | null,
    assertOwned: () => Promise<void>,
  ) {
    await this.repository.manager.transaction(async (manager) => {
      await assertOwned();
      await manager
        .getRepository(WagoManagedAccess)
        .update(row.sessionId, { host: row.targetHost, encryptedCredentials });
      await manager.getRepository(WagoCommissioningSession).update(row.sessionId, {
        targetHost: row.targetHost,
        ...(payload ? { mqttServerId: payload.mqttServerId } : {}),
      });
      if (payload) {
        if (payload.previousServerId !== payload.mqttServerId)
          await manager
            .getRepository(WagoMqttCredentialRetirement)
            .save({ controllerId: row.controllerId, mqttServerId: payload.previousServerId });
        // A return to a previous broker makes that identity current again.
        await manager
          .getRepository(WagoMqttCredentialRetirement)
          .delete({ controllerId: row.controllerId, mqttServerId: payload.mqttServerId });
        await manager.getRepository(WagoController).update(row.controllerId, {
          mqttServerId: payload.mqttServerId,
          credentialMqttServerId: payload.mqttServerId,
          credentialEpoch: payload.credentialEpoch,
          lastHeartbeatAt: null,
          updatedAt: new Date().toISOString(),
        });
        await manager.getRepository(WagoCredentialRotationEntity).save({
          controllerId: row.controllerId,
          revision: 1,
          token: payload.token,
          phase: 'completed',
          credentialEpoch: payload.credentialEpoch,
          mqttServerId: payload.mqttServerId,
          prefix: payload.prefix,
          encryptedCredentials: null,
        });
      }
      await assertOwned();
    });
  }

  protected payload(row: WagoNetworkChange, controller: WagoController): NetworkPayload {
    try {
      const payload = JSON.parse(this.context.secrets.decrypt(row.encryptedPayload ?? '')) as NetworkPayload;
      if (
        payload.controllerId !== row.controllerId ||
        payload.sessionId !== row.sessionId ||
        payload.fingerprint !== row.fingerprint ||
        payload.targetHost !== row.targetHost ||
        payload.mqttServerId !== row.mqttServerId ||
        payload.hardwareId !== controller.hardwareId ||
        (payload.supersededDigest !== undefined && !/^[a-f0-9]{64}$/.test(payload.supersededDigest)) ||
        ![payload.previousEpoch, payload.credentialEpoch].includes(controller.credentialEpoch ?? '') ||
        ![payload.previousServerId, payload.mqttServerId].includes(controller.mqttServerId)
      )
        throw new Error();
      return payload;
    } catch {
      throw new RuntimeUpdateError('management_required');
    }
  }

  protected async brokerConnection(mqttServerId: number) {
    const broker = await this.context.getMqttServerConfig(mqttServerId);
    if (!broker) throw new NetworkChangeError('broker_configuration');
    try {
      assertCommissioningBroker(broker);
    } catch {
      throw new NetworkChangeError('broker_configuration');
    }
    if (
      (broker.tlsServername && !/^[A-Za-z0-9.-]+$/.test(broker.tlsServername)) ||
      (broker.caCert?.length ?? 0) > 32768
    )
      throw new NetworkChangeError('broker_configuration');
    return {
      url: `${broker.useTls ? 'mqtts' : 'mqtt'}://${broker.host}:${broker.port}`,
      tlsInsecure: !!(broker.useTls && broker.tlsInsecure),
      tlsServername: broker.useTls ? (broker.tlsServername ?? '') : '',
      caCert: broker.useTls && !broker.tlsInsecure ? (broker.caCert ?? '') : '',
    };
  }

  protected async phase(row: WagoNetworkChange, phase: WagoNetworkChange['phase'], assertOwned: () => Promise<void>) {
    await assertOwned();
    row.phase = phase;
    row.failure = null;
    row.updatedAt = new Date().toISOString();
    await this.repository.save(row);
  }

  async status(controllerId: number) {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id: controllerId });
    if (!controller) throw new NotFoundException('WAGO controller not found');
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    const row = await this.repository.findOneBy({ controllerId });
    const lease =
      row && (await this.context.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: row.fingerprint }));
    return {
      available: access?.state === 'managed',
      targetHost: access?.host ?? null,
      mqttServerId: controller.mqttServerId,
      pendingCredentialRetirements: await this.context
        .getRepository(WagoMqttCredentialRetirement)
        .countBy({ controllerId }),
      operation: row
        ? {
            targetHost: row.targetHost,
            mqttServerId: row.mqttServerId,
            phase: row.phase,
            failure: row.failure,
            running: row.phase !== 'completed' && !!lease?.owner && Number(lease.leaseUntil) > Date.now(),
          }
        : null,
    };
  }

  async retirePreviousCredentials(controllerId: number, principal: PluginAuditPrincipal) {
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    if (!access) throw new ConflictException('Controller management identity is unavailable.');
    const operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation)),
      owner = randomBytes(16).toString('hex');
    if (!(await operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 120_000)))
      throw new ConflictException('Controller is busy');
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'network_credential_retirement');
    let audited = false;
    try {
      await this.managed.assertNetworkSettled(controllerId);
      await lifecycle.attempt();
      audited = true;
      const controller = await this.context.getRepository(WagoController).findOneByOrFail({ id: controllerId });
      const current = controller.mqttServerId && (await this.context.getMqttServerConfig(controller.mqttServerId));
      if (!current) throw new Error();
      const repository = this.context.getRepository(WagoMqttCredentialRetirement);
      for (const row of await repository.findBy({ controllerId })) {
        const previous = await this.context.getMqttServerConfig(row.mqttServerId);
        if (!previous) throw new Error();
        // Duplicate server records and DNS aliases share the active credentials.
        // Clear that redundant association without revoking the username in use.
        const sameHost =
          previous.host.toLowerCase().replace(/\.$/, '') === current.host.toLowerCase().replace(/\.$/, '');
        let sharedDestination = sameHost;
        if (!sameHost) {
          const destinations = await Promise.all([
            lookup(previous.host, { all: true }),
            lookup(current.host, { all: true }),
          ]);
          const address = (value: string) => value.toLowerCase().replace(/^::ffff:/, '');
          if (!destinations[0].length || !destinations[1].length) throw new Error();
          const previousAddresses = new Set(destinations[0].map((item) => address(item.address)));
          const currentAddresses = new Set(destinations[1].map((item) => address(item.address)));
          const overlaps = [...previousAddresses].some((item) => currentAddresses.has(item));
          const sameAddresses =
            previousAddresses.size === currentAddresses.size &&
            [...previousAddresses].every((item) => currentAddresses.has(item));
          // A partial overlap may include another credential store. Neither
          // revocation nor dropping the cleanup obligation is safe in that case.
          if (overlaps && !sameAddresses) throw new Error();
          sharedDestination = sameAddresses;
        }
        if (sharedDestination) {
          // Different listeners on a shared host may belong to distinct brokers.
          // Keep ambiguous retirements retryable rather than revoking active credentials.
          if (previous.port !== current.port || previous.useTls !== current.useTls) throw new Error();
          await operations.assertOwned(access.fingerprint, owner);
          await repository.delete({ controllerId, mqttServerId: row.mqttServerId });
          continue;
        }
        await operations.assertOwned(access.fingerprint, owner);
        const identity = `wago-controller-${controller.hardwareId}`;
        const result = await this.context
          .getMqttCredentialProvisioning()
          .revoke({ mqttServerId: row.mqttServerId, identity, username: identity, vhost: '/' });
        if (result) throw new Error();
        await operations.assertOwned(access.fingerprint, owner);
        await repository.delete({ controllerId, mqttServerId: row.mqttServerId });
      }
      await lifecycle.finish('succeeded');
      audited = false;
      return this.status(controllerId);
    } catch {
      if (audited) await lifecycle.finish('failed').catch(() => undefined);
      throw new ConflictException(
        'Previous broker credentials could not be retired. Check the previous broker connection and retry.',
      );
    } finally {
      await operations.release(access.fingerprint, owner);
    }
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.active.forEach((controller) => controller.abort());
  }

  protected get repository() {
    return this.context.getRepository(WagoNetworkChange);
  }
}
