import {
  PLUGIN_CONTEXT,
  type PluginAuditPrincipal,
  type PluginContext,
  type PluginMqttSubscription,
} from '@attraccess/plugins-backend-sdk/v2';
import { WagoCredentialPersistence } from './persistence/port';
import type { WagoCredentialRotation } from './persistence/records';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../../shared/clock';
import { sourceTime } from '../diagnostics/envelope';
import { normalizeOperationalPrefix } from '../protocol/index';
import { WagoAudit } from '../audit/index';
import { WagoController } from '../controllers/record';
import { type CommissioningOperationGuard } from '../runtime/operation-guard';

export class WagoCredentialRotationUncertainError extends ConflictException {
  constructor() {
    super('Credential rotation is incomplete. Inspect its recovery state and retry the pending handoff.');
  }
}

export const CAPABILITY = 'credential-rotation-v1';

export const WAIT_MS = 30_000;

export type Credential = { username: string; password: string };

export function assertRotationController(
  controller: WagoController,
  retry: boolean,
): asserts controller is WagoController & { mqttServerId: number } {
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
  const heartbeatAt = sourceTime(controller.lastHeartbeatAt);
  const now = Date.now();
  // A discovery announcement cannot establish that the permanent runtime is subscribed.
  // Retry only delivers an already rotated credential; allow recovery without a fresh heartbeat.
  if (
    !retry &&
    (heartbeatAt === null || heartbeatAt > now + CONTROLLER_CLOCK_TOLERANCE_MS || now - heartbeatAt >= 90_000)
  )
    throw new ConflictException('Wait for a fresh permanent controller heartbeat before rotating credentials.');
}

export function checkPendingRotation(
  previous: WagoCredentialRotation | null,
  credentialEpoch: string,
  retry: boolean,
  mqttServerId: number,
  prefix: string,
) {
  if (previous && previous.credentialEpoch !== credentialEpoch)
    throw new ConflictException('Recover the previous credential registration before rotating again.');
  if (previous && previous.phase !== 'completed' && !retry)
    throw new ConflictException('Retry the pending credential handoff instead of rotating again.');
  if (retry && (!previous || previous.phase === 'provisioning'))
    throw new ConflictException('Broker rotation completion is uncertain. Recover broker credentials before retrying.');
  if (retry && previous?.phase === 'completed') return { state: 'completed' as const, revision: previous.revision };
  if (previous && (previous.mqttServerId !== mqttServerId || previous.prefix !== prefix))
    throw new ConflictException('Credential rotation must use its original broker and namespace.');
  return undefined;
}

@Injectable()
export class WagoCredentialRotationService {
  public constructor(
    @Inject(PLUGIN_CONTEXT)
    protected readonly context: Pick<
      PluginContext,
      'mqtt' | 'getMqttCredentialProvisioning' | 'secrets' | 'audit' | 'logger'
    >,
    @Inject(WagoCredentialPersistence) protected readonly persistence: WagoCredentialPersistence,
  ) {}

  protected async handoff(
    hardwareId: string,
    row: WagoCredentialRotation,
    credential: Credential,
    guard: CommissioningOperationGuard,
  ) {
    const topic = `${row.prefix}/v1/controllers/${hardwareId}/credentials/rotate`;
    const expiry = Math.min(Date.now() + WAIT_MS, guard.deadline);
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
    const timer = setTimeout(reject, Math.max(0, expiry - Date.now()));
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
              if (
                ack?.credentialEpoch === row.credentialEpoch &&
                ack?.revision === row.revision &&
                ack?.token === row.token &&
                ack?.status === 'reconnected'
              )
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
            JSON.stringify({
              ...credential,
              credentialEpoch: row.credentialEpoch,
              revision: row.revision,
              token: row.token,
              expiresAt: new Date(expiry).toISOString(),
            }),
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

  async rotate(
    controllerId: number,
    prefix: string,
    principal: PluginAuditPrincipal,
    guard: CommissioningOperationGuard,
    retry = false,
  ) {
    await guard.assertOwned();
    const controller = await this.persistence.controller(controllerId);
    if (!controller) throw new NotFoundException('WAGO controller not found');
    assertRotationController(controller, retry);
    const credentialEpoch: unknown = await this.persistence.credentialEpoch(controllerId);
    if (
      typeof credentialEpoch !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialEpoch)
    )
      throw new ConflictException('Re-enroll this controller with a credential epoch before rotating credentials.');
    prefix = normalizeOperationalPrefix(prefix);
    const identity = `wago-controller-${controller.hardwareId}`;
    const previous = await this.persistence.rotation(controllerId, true);
    const completed = checkPendingRotation(previous, credentialEpoch, retry, controller.mqttServerId, prefix);
    if (completed) return completed;
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'credential_rotation');
    await lifecycle.attempt();
    let uncertain = retry;
    try {
      let row = previous;
      if (!retry) {
        const revision = (previous?.revision ?? 0) + 1;
        if (!Number.isSafeInteger(revision)) throw new ConflictException('Credential rotation revision exhausted.');
        row = {
          controllerId,
          revision,
          credentialEpoch,
          phase: 'provisioning',
          mqttServerId: controller.mqttServerId,
          prefix,
          token: randomBytes(32).toString('base64url'),
          encryptedCredentials: null,
        };
        await guard.assertOwned();
        await this.persistence.saveRotation(row);
        await guard.assertOwned();
        const root = `${prefix}/v1/controllers/${controller.hardwareId}`;
        uncertain = true;
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
          uncertain = false;
          // The manual-provider response is instructions only, not a completed broker mutation.
          if (previous) await this.persistence.saveRotation(previous);
          else await this.persistence.removeRotation(controllerId);
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
        await this.persistence.saveRotation(row);
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
      await this.persistence.saveRotation(row);
      await guard.assertOwned();
      await lifecycle.finish('succeeded');
      return { state: 'completed' as const, revision: row.revision };
    } catch {
      await lifecycle.finish('failed');
      if (uncertain) throw new WagoCredentialRotationUncertainError();
      throw new ConflictException(
        'Credential rotation is incomplete. Inspect its recovery state and retry the pending handoff.',
      );
    }
  }

  /** Call inside guarded removal, before its existing broker revocation; deletion then cascades this row. */
  async assertRemovalBroker(controllerId: number, mqttServerId: number): Promise<void> {
    const row = await this.persistence.rotation(controllerId);
    if (row && row.mqttServerId !== mqttServerId)
      throw new ConflictException('Revoke the original rotation broker identity before removing this controller.');
  }

  async status(controllerId: number) {
    const row = await this.persistence.rotationStatus(controllerId);
    return row ? { state: row.phase, revision: row.revision } : { state: 'none' as const };
  }
}
