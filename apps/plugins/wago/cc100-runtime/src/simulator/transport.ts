import type { MqttClient } from 'mqtt';
import type { Transport } from '../runtime';
import { publish, subscribe, rejectDesired } from './mqtt';
export function createSimulatorTransport(mqtt: MqttClient, scenario: string): Transport {
  return {
    publish: (topic, payload, options) =>
      mqtt.connected ? publish(mqtt, topic, payload, options?.retain) : Promise.resolve(),
    subscribe: (topic, listener) =>
      subscribe(mqtt, topic, (payload) =>
        scenario === 'reject-configuration' && topic.endsWith('/configuration/desired')
          ? rejectDesired(mqtt, topic, payload)
          : listener(payload),
      ),
  };
}
