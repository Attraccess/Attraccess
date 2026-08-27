import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProvider, mqttFiltersToRegex } from './rabbitmq-credential-provisioning.provider';

describe('RabbitmqCredentialProvisioningProvider', () => {
  const context = {
    getMqttServerConfig: jest.fn().mockResolvedValue({ id: 4, username: 'admin' }),
  } as unknown as PluginContext;

  it('translates exact MQTT filters without widening another device namespace', () => {
    const regex = new RegExp(mqttFiltersToRegex(['devices/controller-a/reported/#', 'devices/controller-a/heartbeat']));

    expect(regex.test('devices/controller-a/reported/state')).toBe(true);
    expect(regex.test('devices/controller-b/reported/state')).toBe(false);
    expect(regex.test('devices/controller-a/heartbeat')).toBe(true);
    expect(regex.test('devices/controller-b/heartbeat')).toBe(false);
  });

  it('creates user, vhost, and topic permissions and returns the password only to the caller', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest.spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND))
      .mockResolvedValue(null);

    const credential = await provider.provision({
      mqttServerId: 4,
      identity: 'controller-a',
      username: 'wago-controller-a',
      vhost: '/',
      topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
    });

    expect(credential).toMatchObject({ identity: 'controller-a', username: 'wago-controller-a', vhost: '/' });
    expect(credential.password).toEqual(expect.any(String));
    expect(request).toHaveBeenNthCalledWith(2, expect.anything(), 'PUT', '/users/wago-controller-a', expect.objectContaining({ password: credential.password }));
    expect(request).toHaveBeenNthCalledWith(4, expect.anything(), 'PUT', '/topic-permissions/%2F/wago-controller-a', {
      exchange: 'amq.topic',
      write: '^(?:devices/controller-a/reported/.*)$',
      read: '^(?:devices/controller-a/desired/.*)$',
    });
  });

  it('refuses to alter the configured management identity', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);

    await expect(
      provider.provision({
        mqttServerId: 4,
        identity: 'admin',
        username: 'admin',
        vhost: '/',
        topicPolicy: { publish: [], subscribe: [] },
      })
    ).rejects.toThrow('management identity');
  });
});
