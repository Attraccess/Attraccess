import { NotFoundException } from '@nestjs/common';
import { ShellyController } from './shelly.controller';

describe('ShellyController ATT-498 device info and auth', () => {
  const registry = {
    findById: jest.fn(),
    updateAuthState: jest.fn(),
  };
  const probe = { probe: jest.fn() };
  const discovery = { discover: jest.fn() };
  const deviceApi = {
    getDeviceInfo: jest.fn(),
    setAdminPassword: jest.fn(),
  };
  let controller: ShellyController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ShellyController(
      registry as never,
      probe as never,
      discovery as never,
      deviceApi as never,
      {} as never
    );
  });

  it('returns device status and config for a registered device', async () => {
    registry.findById.mockResolvedValue({ id: 1, ipAddress: '192.168.1.20', generation: 2 });
    deviceApi.getDeviceInfo.mockResolvedValue({ generation: 2, status: { ok: true }, config: { name: 'Relay' }, fetchedAt: 'now' });

    await expect(controller.info(1, {})).resolves.toEqual({ generation: 2, status: { ok: true }, config: { name: 'Relay' }, fetchedAt: 'now' });
    expect(deviceApi.getDeviceInfo).toHaveBeenCalledWith({ ipAddress: '192.168.1.20', generation: 2, username: undefined, currentPassword: undefined });
  });

  it('sets the admin password and marks auth required', async () => {
    const updated = { id: 1, ipAddress: '192.168.1.21', generation: 1, authState: 'required' };
    registry.findById.mockResolvedValueOnce({ id: 1, ipAddress: '192.168.1.21', generation: 1 }).mockResolvedValueOnce(updated);

    await expect(controller.setAuth(1, { password: 'secret', currentPassword: 'old' })).resolves.toBe(updated);
    expect(deviceApi.setAdminPassword).toHaveBeenCalledWith({
      ipAddress: '192.168.1.21',
      generation: 1,
      username: undefined,
      currentPassword: 'old',
      password: 'secret',
    });
    expect(registry.updateAuthState).toHaveBeenCalledWith(1, 'required');
  });

  it('throws not found for missing devices', async () => {
    registry.findById.mockResolvedValue(null);

    await expect(controller.info(404, {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
