import type { MqttClient } from 'mqtt';
import { createSimulatorTransport } from './transport';

describe('simulator transport', () => {
  it('refuses a publish while disconnected, like the production transport', async () => {
    const mqtt = { connected: false, publish: jest.fn() } as unknown as MqttClient;
    const transport = createSimulatorTransport(mqtt, 'normal');

    await expect(transport.publish('topic', {})).rejects.toThrow('MQTT connection unavailable');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('resolves once the broker acknowledges a publish while connected', async () => {
    const publish = jest.fn((_topic: string, _payload: string, _options: unknown, done: (error?: Error) => void) =>
      done(),
    );
    const transport = createSimulatorTransport({ connected: true, publish } as unknown as MqttClient, 'normal');

    await expect(transport.publish('topic', { a: 1 }, { retain: true })).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledWith('topic', '{"a":1}', { qos: 1, retain: true }, expect.any(Function));
  });
});
