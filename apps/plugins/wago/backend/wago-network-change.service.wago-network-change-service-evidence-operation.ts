import type { PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';
import { EVIDENCE_MS } from "./wago-network-change.service.evidence-ms";
import { NetworkPayload } from "./wago-network-change.service.network-payload";
import { NetworkChangeError } from "./wago-network-change.service.errors";
import { WagoNetworkChangeServiceSaveBindingsOperation } from "./wago-network-change.service.wago-network-change-service-save-bindings-operation";
export abstract class WagoNetworkChangeServiceEvidenceOperation extends WagoNetworkChangeServiceSaveBindingsOperation {

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
}
