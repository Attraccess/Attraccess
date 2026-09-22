import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { RabbitmqUsersService } from './rabbitmq-users.service';
import { RabbitmqManagementClient } from './rabbitmq-management-client';

describe('RabbitMQ user management', () => {
  const config = { username: 'management' };
  const getMqttServerConfig = jest.fn();
  const request = jest.fn();
  let service: RabbitmqUsersService;
  beforeEach(async () => {
    jest.resetAllMocks();
    getMqttServerConfig.mockResolvedValue(config);
    const module = await Test.createTestingModule({
      providers: [
        RabbitmqUsersService,
        { provide: Symbol.for('attraccess.plugin.context'), useValue: { getMqttServerConfig } },
        { provide: RabbitmqManagementClient, useValue: { request } },
      ],
    }).compile();
    service = module.get(RabbitmqUsersService);
  });
  it('joins sorted public user metadata with permissions and strips password hashes', async () => {
    request.mockImplementation(
      async (_config, _method, path) =>
        ({
          '/users': [
            { name: 'zeta', tags: ['administrator', ''], password_hash: 'secret' },
            { name: 'alpha', tags: ' management, monitoring ' },
          ],
          '/permissions': [{ user: 'zeta', vhost: '/', configure: '.*', write: '^topic', read: '.*' }],
          '/vhosts': [{ name: 'z' }, { name: '/' }],
        })[path],
    );
    await expect(service.listUsers(2)).resolves.toEqual({
      mqttServerId: 2,
      users: [
        { name: 'alpha', tags: ['management', 'monitoring'], permissions: [] },
        {
          name: 'zeta',
          tags: ['administrator'],
          permissions: [{ vhost: '/', configure: '.*', write: '^topic', read: '.*' }],
        },
      ],
      vhosts: ['/', 'z'],
    });
  });
  it('preserves the stored hash and algorithm when changing tags without a password', async () => {
    request.mockResolvedValueOnce({
      name: 'device/a',
      tags: 'monitoring',
      password_hash: 'stored-hash',
      hashing_algorithm: 'rabbit_password_hashing_sha256',
    });
    await service.upsertUser(2, 'device/a', { tags: ['management'] });
    expect(request).toHaveBeenLastCalledWith(config, 'PUT', '/users/device%2Fa', {
      tags: 'management',
      password_hash: 'stored-hash',
      hashing_algorithm: 'rabbit_password_hashing_sha256',
    });
  });
  it('requires a password for new users and does not write a partial account', async () => {
    request.mockRejectedValueOnce(new HttpException('missing', 404));
    await expect(service.upsertUser(2, 'device', {})).rejects.toThrow('Password is required');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('creates a user and applies requested permissions with encoded identifiers', async () => {
    request.mockRejectedValueOnce(new HttpException('missing', 404)).mockResolvedValue(undefined);
    await service.upsertUser(2, 'device/a', {
      password: 'local-password',
      permissions: [{ vhost: '/', configure: '', write: '^device', read: '^device' }],
    });
    expect(request).toHaveBeenNthCalledWith(2, config, 'PUT', '/users/device%2Fa', {
      tags: '',
      password: 'local-password',
    });
    expect(request).toHaveBeenNthCalledWith(3, config, 'PUT', '/permissions/%2F/device%2Fa', {
      configure: '',
      write: '^device',
      read: '^device',
    });
  });
  it('does not interpret broker failures as a missing user', async () => {
    const error = new HttpException('unavailable', 503);
    request.mockRejectedValue(error);
    await expect(service.upsertUser(2, 'device', { password: 'p' })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('refuses to delete the management account', async () => {
    await expect(service.deleteUser(2, 'management')).rejects.toThrow('Refusing to delete');
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects missing broker configuration before making management requests', async () => {
    getMqttServerConfig.mockResolvedValue(null);
    await expect(service.listUsers(99)).rejects.toThrow('MQTT server not found');
    expect(request).not.toHaveBeenCalled();
  });
});
