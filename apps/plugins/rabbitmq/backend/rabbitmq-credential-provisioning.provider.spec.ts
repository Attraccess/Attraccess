import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  RabbitmqCredentialProvisioningProvider,
  mqttFiltersToRegex,
} from './rabbitmq-credential-provisioning.provider';

describe('RabbitmqCredentialProvisioningProvider', () => {
  const context = {
    getMqttServerConfig: jest.fn().mockResolvedValue({ id: 4, username: 'admin' }),
  } as unknown as PluginContext;

  it('translates exact MQTT filters without widening another device namespace', () => {
    const regex = new RegExp(mqttFiltersToRegex(['devices/controller-a/reported/#', 'devices/controller-a/heartbeat']));

    expect(regex.test('devices.controller-a.reported.state')).toBe(true);
    expect(regex.test('devices.controller-a.reported')).toBe(true);
    expect(regex.test('devices.controller-b.reported.state')).toBe(false);
    expect(regex.test('devices.controller-a.heartbeat')).toBe(true);
    expect(regex.test('devices.controller-b.heartbeat')).toBe(false);
  });

  it('limits a single-level wildcard to one RabbitMQ routing-key level', () => {
    const regex = new RegExp(mqttFiltersToRegex(['devices/+/reported']));

    expect(regex.test('devices.controller-a.reported')).toBe(true);
    expect(regex.test('devices.controller.a.reported')).toBe(false);
    expect(regex.test('devices.controller-a.internal.reported')).toBe(false);
    expect(regex.test('devices.controller-a.reported.state')).toBe(false);
  });

  it('rejects malformed wildcard policies instead of widening broker permissions', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);

    await expect(
      provider.provision({
        mqttServerId: 4,
        identity: 'controller-a',
        username: 'wago-controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller-a/#/state'], subscribe: [] },
      }),
    ).rejects.toThrow('MQTT wildcards must occupy a complete topic level');
  });

  it('rejects dot-bearing policies that RabbitMQ cannot distinguish from extra topic levels', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);

    await expect(
      provider.provision({
        mqttServerId: 4,
        identity: 'controller-a',
        username: 'wago-controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller.a/reported'], subscribe: [] },
      }),
    ).rejects.toThrow('RabbitMQ MQTT topic policies cannot contain dots');
  });

  it('treats an already deleted credential as revoked', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest
      .spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockRejectedValue(new HttpException('not found', HttpStatus.NOT_FOUND));

    await expect(
      provider.revoke({ mqttServerId: 4, identity: 'controller-a', username: 'wago-controller-a', vhost: '/' }),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(expect.anything(), 'DELETE', '/users/wago-controller-a');
  });

  it('creates user, vhost, and topic permissions and returns the password only to the caller', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest
      .spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND))
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
    expect(request).toHaveBeenNthCalledWith(3, expect.anything(), 'PUT', '/vhosts/%2F');
    expect(request).toHaveBeenNthCalledWith(
      4,
      expect.anything(),
      'PUT',
      '/users/wago-controller-a',
      expect.objectContaining({ password: credential.password }),
    );
    expect(request).toHaveBeenNthCalledWith(6, expect.anything(), 'PUT', '/topic-permissions/%2F/wago-controller-a', {
      exchange: 'amq.topic',
      write: '^(?:devices\\.controller-a\\.reported(?:\\..*)?)$',
      read: '^(?:devices\\.controller-a\\.desired(?:\\..*)?)$',
    });
  });

  it('restores an existing user permissions when rotation fails', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest
      .spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ configure: '^old$', write: '^old$', read: '^old$' })
      .mockResolvedValueOnce({ exchange: 'amq.topic', write: '^old-write$', read: '^old-read$' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('topic permissions failed'))
      .mockResolvedValue(null);

    await expect(
      provider.rotate({
        mqttServerId: 4,
        identity: 'controller-a',
        username: 'wago-controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
      }),
    ).rejects.toThrow('topic permissions failed');

    expect(request).toHaveBeenNthCalledWith(8, expect.anything(), 'PUT', '/permissions/%2F/wago-controller-a', {
      configure: '^old$',
      write: '^old$',
      read: '^old$',
    });
    expect(request).toHaveBeenNthCalledWith(9, expect.anything(), 'PUT', '/topic-permissions/%2F/wago-controller-a', {
      exchange: 'amq.topic',
      write: '^old-write$',
      read: '^old-read$',
    });
  });

  it('surfaces incomplete rollback after attempting to restore every existing-user permission', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest
      .spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ configure: '^old$', write: '^old$', read: '^old$' })
      .mockResolvedValueOnce({ exchange: 'amq.topic', write: '^old-write$', read: '^old-read$' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('topic permissions failed'))
      .mockRejectedValueOnce(new Error('generic permission restore failed'))
      .mockResolvedValueOnce(null);

    await expect(
      provider.rotate({
        mqttServerId: 4,
        identity: 'controller-a',
        username: 'wago-controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
      }),
    ).rejects.toThrow('rollback was incomplete');

    expect(request).toHaveBeenNthCalledWith(9, expect.anything(), 'PUT', '/topic-permissions/%2F/wago-controller-a', {
      exchange: 'amq.topic',
      write: '^old-write$',
      read: '^old-read$',
    });
  });

  it('removes a newly created vhost after a failed new credential write', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const request = jest
      .spyOn((provider as unknown as { client: { request: jest.Mock } }).client, 'request')
      .mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND))
      .mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('permissions failed'))
      .mockResolvedValue(null);

    await expect(
      provider.provision({
        mqttServerId: 4,
        identity: 'controller-a',
        username: 'wago-controller-a',
        vhost: '/',
        topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: ['devices/controller-a/desired/#'] },
      }),
    ).rejects.toThrow('permissions failed');

    expect(request).toHaveBeenNthCalledWith(6, expect.anything(), 'DELETE', '/users/wago-controller-a');
    expect(request).toHaveBeenNthCalledWith(7, expect.anything(), 'DELETE', '/vhosts/%2F');
  });

  it('serializes credential writes for the same server and vhost', async () => {
    const provider = new RabbitmqCredentialProvisioningProvider(context);
    const credential = {
      providerId: 'rabbitmq',
      identity: 'controller-a',
      username: 'wago-controller-a',
      vhost: '/',
      password: 'generated',
    };
    let finishFirst!: () => void;
    const firstWrite = new Promise<typeof credential>((resolve) => {
      finishFirst = () => resolve(credential);
    });
    const write = jest
      .spyOn(
        provider as unknown as {
          writeCredentialLocked(request: unknown, config: unknown): Promise<typeof credential>;
        },
        'writeCredentialLocked',
      )
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce(credential);
    const request = {
      mqttServerId: 4,
      identity: 'controller-a',
      username: 'wago-controller-a',
      vhost: '/',
      topicPolicy: { publish: ['devices/controller-a/reported/#'], subscribe: [] },
    };

    const first = provider.provision(request);
    const second = provider.provision(request);
    await new Promise((resolve) => setImmediate(resolve));

    expect(write).toHaveBeenCalledTimes(1);
    finishFirst();
    await Promise.all([first, second]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(
      (
        RabbitmqCredentialProvisioningProvider as unknown as {
          vhostLocks: Map<string, unknown>;
        }
      ).vhostLocks.has('4:/'),
    ).toBe(false);
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
      }),
    ).rejects.toThrow('management identity');
  });
});
