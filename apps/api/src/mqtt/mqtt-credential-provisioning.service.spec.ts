import type { MqttCredentialProvisioningProvider } from '@attraccess/plugins-backend-sdk';
import { MqttCredentialProvisioningService } from './mqtt-credential-provisioning.service';
import { MqttServerHostProviderService } from './mqtt-server-host.provider';

describe('MqttCredentialProvisioningService', () => {
  const server = {
    getServerConfig: jest.fn().mockResolvedValue({ id: 1, host: 'broker' }),
  } as unknown as MqttServerHostProviderService;

  it('returns exact manual instructions when no installed provider supports the broker', async () => {
    const service = new MqttCredentialProvisioningService(server);

    await expect(
      service.provision({
        mqttServerId: 1,
        identity: 'controller-a',
        username: 'controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
      }),
    ).resolves.toMatchObject({
      username: 'controller-a',
      publishTopics: ['devices/controller-a/reported/#'],
      subscribeTopics: ['devices/controller-a/desired/#'],
    });
  });

  it('returns operation-specific manual instructions for unsupported brokers', async () => {
    const service = new MqttCredentialProvisioningService(server);
    const request = {
      mqttServerId: 1,
      identity: 'controller-a',
      username: 'controller-a',
      vhost: '/',
      topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
    };

    await expect(service.rotate(request)).resolves.toMatchObject({
      instructions: expect.arrayContaining(['Replace the password for MQTT user "controller-a" in vhost "/".']),
    });
    await expect(service.revoke(request)).resolves.toMatchObject({
      instructions: expect.arrayContaining(['Remove or disable MQTT user "controller-a" and its ACLs in vhost "/".']),
    });
  });

  it('returns a provider secret only from the provisioning result', async () => {
    const provider: MqttCredentialProvisioningProvider = {
      id: `test-${Date.now()}`,
      displayName: 'Test broker',
      supports: jest.fn().mockResolvedValue(true),
      provision: jest
        .fn()
        .mockResolvedValue({ providerId: 'test', identity: 'a', username: 'a', vhost: '/', password: 'one-time' }),
      rotate: jest.fn(),
      revoke: jest.fn(),
    };
    MqttCredentialProvisioningService.register(provider);
    const service = new MqttCredentialProvisioningService(server);

    const result = await service.provision({
      mqttServerId: 1,
      identity: 'a',
      username: 'a',
      vhost: '/',
      topicPolicy: { publish: [], subscribe: [] },
    });

    expect(result).toMatchObject({ password: 'one-time' });
    expect(await service.availableProviders(1)).toEqual([{ providerId: provider.id, displayName: 'Test broker' }]);
  });
});
