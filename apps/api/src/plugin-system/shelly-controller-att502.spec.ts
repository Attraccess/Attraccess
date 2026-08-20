import { BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @nx/enforce-module-boundaries -- test covers host behavior against plugin controller integration.
import { ShellyController } from '../../../plugins/shelly/backend/shelly.controller';

describe('ShellyController ATT-502 device registration', () => {
  const registry = { findByIp: jest.fn(), create: jest.fn() };
  const probe = { probe: jest.fn() };
  let controller: ShellyController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ShellyController(registry as never, probe as never, {} as never, {} as never, {} as never);
  });

  it.each(['127.0.0.1', '192.168.1.20:3000', 'http://192.168.1.20', '8.8.8.8', 'shelly.local'])(
    'rejects %s before it can become a probe target',
    async (ipAddress) => {
      await expect(controller.add({ ipAddress })).rejects.toBeInstanceOf(BadRequestException);
      expect(registry.findByIp).not.toHaveBeenCalled();
      expect(probe.probe).not.toHaveBeenCalled();
      expect(registry.create).not.toHaveBeenCalled();
    },
  );

  it('continues to register a private IPv4 address when probing fails', async () => {
    registry.findByIp.mockResolvedValue(null);
    probe.probe.mockRejectedValue(new Error('connect ETIMEDOUT'));
    registry.create.mockResolvedValue({ id: 1, ipAddress: '192.168.1.20' });

    await expect(controller.add({ ipAddress: '192.168.1.20' })).resolves.toEqual({ id: 1, ipAddress: '192.168.1.20' });
    expect(probe.probe).toHaveBeenCalledWith('192.168.1.20');
  });
});
