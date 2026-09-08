import { NotFoundException } from '@nestjs/common';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerService } from './servers/mqtt-server.service';
import { MqttServerHostProviderService } from './mqtt-server-host.provider';

describe('MqttServerHostProviderService', () => {
  function buildProvider(findOne: jest.Mock): MqttServerHostProviderService {
    return new MqttServerHostProviderService({ findOne } as unknown as MqttServerService);
  }

  it('maps the server (with its already-decrypted password) to a connection config', async () => {
    const server: Partial<MqttServer> = {
      id: 42,
      name: 'Workshop',
      host: 'mqtt.example.com',
      port: 8883,
      useTls: true,
      caCert: 'fixture-private-ca',
      tlsInsecure: false,
      tlsServername: 'mqtt.example.com',
      username: 'mqttuser',
      password: 'decrypted-secret',
      clientId: 'attraccess-client-1',
    };
    const findOne = jest.fn().mockResolvedValue(server);
    const provider = buildProvider(findOne);

    const config = await provider.getServerConfig(42);

    expect(findOne).toHaveBeenCalledWith(42);
    expect(config).toEqual({
      id: 42,
      name: 'Workshop',
      host: 'mqtt.example.com',
      port: 8883,
      useTls: true,
      caCert: 'fixture-private-ca',
      tlsInsecure: false,
      tlsServername: 'mqtt.example.com',
      username: 'mqttuser',
      password: 'decrypted-secret',
      clientId: 'attraccess-client-1',
    });
  });

  it('returns null when the server does not exist', async () => {
    const findOne = jest.fn().mockRejectedValue(new NotFoundException('nope'));
    const provider = buildProvider(findOne);

    await expect(provider.getServerConfig(999)).resolves.toBeNull();
  });

  it('rethrows unexpected errors', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('db down'));
    const provider = buildProvider(findOne);

    await expect(provider.getServerConfig(1)).rejects.toThrow('db down');
  });
});
