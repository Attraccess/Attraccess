import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import type { CommissioningOperationGuard } from './wago-operation-guard';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { WAIT_MS } from './wago-credential-rotation.state';
import { Credential } from './wago-credential-rotation.credential';
import { WagoCredentialRotationServiceRotateOperation } from './wago-credential-rotation.wago-credential-rotation-service-rotate-operation';


export abstract class WagoCredentialRotationServiceHandoffOperation extends WagoCredentialRotationServiceRotateOperation {
  protected async handoff(
    hardwareId: string,
    row: WagoCredentialRotationEntity,
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
}
