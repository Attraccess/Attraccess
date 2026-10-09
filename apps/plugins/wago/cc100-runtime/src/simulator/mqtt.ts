import { type MqttClient } from 'mqtt';

export function publish(mqtt: MqttClient, topic: string, payload: unknown, retain = false): Promise<void> {
  return new Promise((resolve, reject) =>
    mqtt.publish(topic, JSON.stringify(payload), { qos: 1, retain }, (error) => (error ? reject(error) : resolve())),
  );
}

export function subscribe(
  mqtt: MqttClient,
  topic: string,
  listener: (payload: Buffer) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) =>
    mqtt.subscribe(topic, { qos: 1 }, (error) => {
      if (error) return reject(error);
      mqtt.on('message', (receivedTopic, payload) => {
        if (receivedTopic === topic) void handleAsync(() => listener(payload));
      });
      resolve();
    }),
  );
}

import { validateDesired } from '../runtime';

export // Rejection is a simulator protocol scenario, not an optional production-runtime
// constructor hook. Normal configuration always reaches the shared runtime.
async function rejectDesired(mqtt: MqttClient, topic: string, payload: Buffer): Promise<void> {
  let desired;
  try {
    desired = JSON.parse(payload.toString('utf8'));
  } catch {
    await publish(
      mqtt,
      topic.replace(/desired$/, 'reported'),
      {
        revision: 0,
        contentHash: '',
        errors: [{ path: '$', code: 'invalid_json', message: 'desired configuration is not valid JSON' }],
      },
      true,
    );
    return;
  }
  await publish(
    mqtt,
    topic.replace(/desired$/, 'reported'),
    {
      revision: desired?.revision ?? 0,
      contentHash: desired?.contentHash ?? '',
      errors: [
        ...validateDesired(desired),
        { path: '$', code: 'simulated_rejection', message: 'configuration rejected by simulator scenario' },
      ],
    },
    true,
  );
}

export function handleAsync(callback: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(callback)
    .catch((error: unknown) => {
      process.stderr.write(
        `WAGO simulator callback failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    });
}

export function logConnectionError(error: Error): void {
  process.stderr.write(`WAGO simulator MQTT connection error: ${error.message}\n`);
}
