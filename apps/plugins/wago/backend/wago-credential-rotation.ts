import { randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PLUGIN_CONTEXT,
  type PluginAuditPrincipal,
  type PluginContext,
  type PluginMqttSubscription,
} from '@attraccess/plugins-backend-sdk';
import type { CommissioningOperationGuard } from './wago-commissioning-lease';
import { normalizeOperationalPrefix } from './protocol';
import { WagoAudit } from './wago-audit';
import { WagoController } from './wago-controller.entity';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';

const CAPABILITY = 'credential-rotation-v1';
const WAIT_MS = 30_000;
type Credential = { username: string; password: string };

/** Caller supplies the existing shared controller-operation lease; no independent competing lock. */
@Injectable()
export class WagoCredentialRotationService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get repository() {
    return this.context.getRepository(WagoCredentialRotationEntity);
  }

  async status(controllerId: number) {
    const row = await this.repository.findOne({ where: { controllerId }, select: { phase: true, revision: true } });
    return row ? { state: row.phase, revision: row.revision } : { state: 'none' as const };
  }

  /** Call inside guarded removal, before its existing broker revocation; deletion then cascades this row. */
  async assertRemovalBroker(controllerId: number, mqttServerId: number): Promise<void> {
    const row = await this.repository.findOneBy({ controllerId });
    if (row && row.mqttServerId !== mqttServerId)
      throw new ConflictException('Revoke the original rotation broker identity before removing this controller.');
  }

  async rotate(
    controllerId: number,
    prefix: string,
    principal: PluginAuditPrincipal,
    guard: CommissioningOperationGuard,
    retry = false,
  ) {
    await guard.assertOwned();
    const controller = await this.context.getRepository(WagoController).findOneBy({ id: controllerId });
    if (!controller) throw new NotFoundException('WAGO controller not found');
    if (controller.trustState !== 'claimed' || !controller.mqttServerId || controller.compatibilityError)
      throw new ConflictException('A compatible claimed controller is required.');
    if (
      'credentialMqttServerId' in controller &&
      controller.credentialMqttServerId != null &&
      controller.credentialMqttServerId !== controller.mqttServerId
    )
      throw new ConflictException('Use the original credential broker before rotating credentials.');
    let capabilities: unknown;
    try {
      capabilities = JSON.parse(controller.capabilities);
    } catch {
      capabilities = [];
    }
    if (!Array.isArray(capabilities) || !capabilities.includes(CAPABILITY))
      throw new ConflictException('Install a runtime supporting credential-rotation-v1 before rotating credentials.');
    prefix = normalizeOperationalPrefix(prefix);
    const identity = `wago-controller-${controller.hardwareId}`;
    const previous = await this.repository
      .createQueryBuilder('rotation')
      .addSelect('rotation.encryptedCredentials')
      .where('rotation.controllerId = :controllerId', { controllerId })
      .getOne();
    if (previous && previous.phase !== 'completed' && !retry)
      throw new ConflictException('Retry the pending credential handoff instead of rotating again.');
    if (retry && (!previous || previous.phase === 'provisioning'))
      throw new ConflictException(
        'Broker rotation completion is uncertain. Recover broker credentials before retrying.',
      );
    if (retry && previous?.phase === 'completed') return { state: 'completed' as const, revision: previous.revision };
    if (previous && (previous.mqttServerId !== controller.mqttServerId || previous.prefix !== prefix))
      throw new ConflictException('Credential rotation must use its original broker and namespace.');
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'credential_rotation');
    await lifecycle.attempt();
    try {
      let row = previous;
      if (!retry) {
        const revision = (previous?.revision ?? 0) + 1;
        if (!Number.isSafeInteger(revision)) throw new ConflictException('Credential rotation revision exhausted.');
        row = this.repository.create({
          controllerId,
          revision,
          phase: 'provisioning',
          mqttServerId: controller.mqttServerId,
          prefix,
          token: randomBytes(32).toString('base64url'),
          encryptedCredentials: null,
        });
        await guard.assertOwned();
        await this.repository.save(row);
        await guard.assertOwned();
        const root = `${prefix}/v1/controllers/${controller.hardwareId}`;
        const credential = await this.context.getMqttCredentialProvisioning().rotate({
          mqttServerId: row.mqttServerId,
          identity,
          username: identity,
          vhost: '/',
          topicPolicy: {
            publish: [`${root}/#`],
            subscribe: [`${root}/configuration/desired`, `${root}/commands`, `${root}/credentials/rotate`],
          },
        });
        await guard.assertOwned();
        if (!('password' in credential)) {
          // The manual-provider response is instructions only, not a completed broker mutation.
          if (previous) await this.repository.save(previous);
          else await this.repository.delete(controllerId);
          throw new ConflictException('Automatic broker credential rotation is unavailable.');
        }
        if (credential.username !== identity || !credential.password || credential.password.length > 4096)
          throw new ConflictException('Broker credential rotation needs recovery.');
        const plaintext = JSON.stringify({ username: identity, password: credential.password });
        const encrypted = this.context.secrets.encrypt(plaintext);
        if (!encrypted || encrypted === plaintext || this.context.secrets.decrypt(encrypted) !== plaintext)
          throw new ConflictException('Credential recovery storage is unavailable.');
        row.encryptedCredentials = encrypted;
        row.phase = 'pending';
        await guard.assertOwned();
        await this.repository.save(row);
      }
      if (!row?.encryptedCredentials) throw new ConflictException('Credential recovery storage is unavailable.');
      const credential = JSON.parse(this.context.secrets.decrypt(row.encryptedCredentials)) as Credential;
      if (
        credential.username !== identity ||
        typeof credential.password !== 'string' ||
        !credential.password ||
        credential.password.length > 4096
      )
        throw new ConflictException('Credential recovery storage is unavailable.');
      await this.handoff(controller.hardwareId, row, credential, guard);
      await guard.assertOwned();
      row.phase = 'completed';
      row.encryptedCredentials = null;
      await this.repository.save(row);
      await guard.assertOwned();
      await lifecycle.finish('succeeded');
      return { state: 'completed' as const, revision: row.revision };
    } catch {
      await lifecycle.finish('failed');
      throw new ConflictException(
        'Credential rotation is incomplete. Inspect its recovery state and retry the pending handoff.',
      );
    }
  }

  private async handoff(
    hardwareId: string,
    row: WagoCredentialRotationEntity,
    credential: Credential,
    guard: CommissioningOperationGuard,
  ) {
    const topic = `${row.prefix}/v1/controllers/${hardwareId}/credentials/rotate`;
    let subscription: PluginMqttSubscription | undefined;
    let closed = false;
    let acknowledge!: () => void;
    const acknowledged = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    let reject!: () => void;
    const cancelled = new Promise<never>((_resolve, fail) => {
      reject = () => fail(new Error('rotation_incomplete'));
    });
    const timer = setTimeout(reject, WAIT_MS);
    guard.signal.addEventListener('abort', reject, { once: true });
    if (guard.signal.aborted) reject();
    try {
      await Promise.race([
        (async () => {
          await guard.assertOwned();
          const pending = await this.context.mqtt.subscribe(row.mqttServerId, `${topic}/ack`, (message) => {
            if (
              closed ||
              guard.signal.aborted ||
              message.serverId !== row.mqttServerId ||
              message.topic !== `${topic}/ack` ||
              message.payload.length > 1024
            )
              return;
            try {
              const ack = JSON.parse(message.payload.toString('utf8'));
              if (ack?.revision === row.revision && ack?.token === row.token && ack?.status === 'reconnected')
                acknowledge();
            } catch {
              /* Ignore untrusted broker data. */
            }
          });
          if (closed) {
            pending.unsubscribe();
            return;
          }
          subscription = pending;
          await guard.assertOwned();
          if (closed) return;
          await this.context.mqtt.publish(
            row.mqttServerId,
            topic,
            JSON.stringify({ ...credential, revision: row.revision, token: row.token }),
            { qos: 1, retain: false },
          );
          await acknowledged;
        })(),
        cancelled,
      ]);
    } finally {
      closed = true;
      clearTimeout(timer);
      guard.signal.removeEventListener('abort', reject);
      subscription?.unsubscribe();
    }
  }
}
