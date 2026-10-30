import type { MqttClient } from 'mqtt';
import type { Transport } from '../runtime';
import {
  DEFAULT_MAX_MESSAGE_BYTES,
  DropCounters,
  type MessageSlot,
  SubscriptionAdmission,
} from '../transport/admission';
import { publish, subscribe, rejectDesired } from './mqtt';
export function createSimulatorTransport(mqtt: MqttClient, scenario: string): Transport {
  const drops = new DropCounters();
  // Built as a variable and typed explicitly so it also satisfies older runtimes' Transport, which
  // predate subscribe options, message slots and drop counts.
  const transport = {
    // Refused while disconnected, like the production transport: a dropped publish must not look delivered.
    publish: (topic: string, payload: unknown, options?: { retain?: boolean }) =>
      mqtt.connected
        ? publish(mqtt, topic, payload, options?.retain)
        : Promise.reject(new Error('MQTT connection unavailable')),
    // The simulator exercises the same admission control as the production transport.
    subscribe: (
      topic: string,
      listener: (payload: Buffer, slot: MessageSlot) => void | Promise<void>,
      options?: { maxBytes: number },
    ) =>
      subscribe(
        mqtt,
        topic,
        (payload, slot) =>
          scenario === 'reject-configuration' && topic.endsWith('/configuration/desired')
            ? rejectDesired(mqtt, topic, payload)
            : listener(payload, slot),
        new SubscriptionAdmission(options?.maxBytes ?? DEFAULT_MAX_MESSAGE_BYTES, drops, (error) =>
          process.stderr.write(`WAGO simulator callback failed: ${String(error)}\n`),
        ),
      ),
    dropCounts: () => drops.snapshot(),
  };
  return transport;
}
