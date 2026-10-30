import type { MqttClient } from 'mqtt';
import type { Transport } from '../runtime';
import { DEFAULT_MAX_MESSAGE_BYTES, DropCounters, SubscriptionAdmission } from '../transport/admission';
import { publish, subscribe, rejectDesired } from './mqtt';
export function createSimulatorTransport(mqtt: MqttClient, scenario: string): Transport {
  const drops = new DropCounters();
  return {
    publish: (topic, payload, options) =>
      mqtt.connected ? publish(mqtt, topic, payload, options?.retain) : Promise.resolve(),
    // The simulator exercises the same admission control as the production transport.
    subscribe: (topic, listener, options) =>
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
}
