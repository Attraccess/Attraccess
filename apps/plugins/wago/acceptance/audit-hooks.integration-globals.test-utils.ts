import type { PluginMqttClient } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from '../backend/configuration';
import { discoveryTopic } from '../backend/protocol';
export const pluginId = 'abcdefghijklmnopqrstu';
export const principal = { userId: 42, authenticationMethod: 'api-token' as const, apiTokenId: 19 };
export const verifier = 'v'.repeat(43);
export const privateValue = 'fixture-only-password-never-audit';
export const snapshot: WagoConfigurationSnapshot = {
  version: 1,
  physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'output',
      physicalPointId: 'point',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'immediate' },
    },
  ],
};
export class FixtureMqtt implements PluginMqttClient {
  readonly handlers = new Map<string, Set<Parameters<PluginMqttClient['subscribe']>[2]>>();
  readonly publish = jest.fn<ReturnType<PluginMqttClient['publish']>, Parameters<PluginMqttClient['publish']>>(
    async () => undefined,
  );
  async subscribe(_serverId: number, topic: string, handler: Parameters<PluginMqttClient['subscribe']>[2]) {
    const handlers = this.handlers.get(topic) ?? new Set();
    this.handlers.set(topic, handlers);
    handlers.add(handler);
    return {
      unsubscribe: () => {
        handlers.delete(handler);
      },
    };
  }
  async receive(topic: string, payload: object) {
    const parts = topic.split('/');
    for (const [filter, handlers] of this.handlers) {
      const expected = filter.split('/');
      if (expected.length !== parts.length || !expected.every((part, index) => part === '+' || part === parts[index]))
        continue;
      for (const handler of [...handlers])
        await handler({ serverId: 1, topic, payload: Buffer.from(JSON.stringify(payload)) });
    }
  }
  async announce(hardwareId: string, enrollmentSecret: string) {
    const handlers = [...(this.handlers.get('attraccess/wago/discovery/+') ?? [])];
    expect(handlers).toHaveLength(1);
    for (const handler of handlers)
      await handler({
        serverId: 1,
        topic: discoveryTopic(hardwareId),
        payload: Buffer.from(
          JSON.stringify({
            hardwareId,
            pairingCode: verifier,
            enrollmentSecret,
            protocolVersion: '1.0.0',
            runtimeVersion: '0.1.0',
            capabilities: ['claim', 'claim-expiry-v1', 'heartbeat', 'configuration-v1'],
          }),
        ),
      });
  }
}
