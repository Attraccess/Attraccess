import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ShellyController } from './shelly.controller';

describe('ShellyController ATT-498 device info and auth', () => {
  const registry = {
    findById: jest.fn(),
    findByIp: jest.fn(),
    create: jest.fn(),
    updateProbe: jest.fn(),
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
      {} as never,
    );
  });

  it('returns device status and config for a registered device', async () => {
    registry.findById.mockResolvedValue({ id: 1, ipAddress: '192.168.1.20', generation: 2 });
    deviceApi.getDeviceInfo.mockResolvedValue({
      generation: 2,
      status: { ok: true },
      config: { name: 'Relay' },
      fetchedAt: 'now',
    });

    await expect(controller.info(1, {})).resolves.toEqual({
      generation: 2,
      status: { ok: true },
      config: { name: 'Relay' },
      fetchedAt: 'now',
    });
    expect(deviceApi.getDeviceInfo).toHaveBeenCalledWith({
      ipAddress: '192.168.1.20',
      generation: 2,
      username: undefined,
      currentPassword: undefined,
    });
  });

  it('sets the admin password and marks auth required', async () => {
    const updated = { id: 1, ipAddress: '192.168.1.21', generation: 1, authState: 'required' };
    registry.findById
      .mockResolvedValueOnce({ id: 1, ipAddress: '192.168.1.21', generation: 1 })
      .mockResolvedValueOnce(updated);

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
  it('validates manual registration and persists successful probe metadata', async () => {
    await expect(controller.add({ ipAddress: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    registry.findByIp.mockResolvedValueOnce({ id: 1 });
    await expect(controller.add({ ipAddress: '192.0.2.7' })).rejects.toBeInstanceOf(ConflictException);
    probe.probe.mockResolvedValue({ generation: 2, model: 'Plus1', authState: 'none' });
    registry.create.mockImplementation(async (value) => ({ id: 7, ...value }));
    await expect(controller.add({ ipAddress: ' 192.0.2.7 ', name: ' Workshop ' })).resolves.toMatchObject({
      id: 7,
      name: 'Workshop',
      ipAddress: '192.0.2.7',
      generation: 2,
      model: 'Plus1',
      authState: 'none',
      lastProbeError: null,
    });
    expect(probe.probe).toHaveBeenCalledWith('192.0.2.7');
  });

  it('keeps an offline manual registration so it can be re-probed later', async () => {
    probe.probe.mockRejectedValue(new Error('Timed out'));
    registry.create.mockImplementation(async (value) => ({ id: 7, ...value }));
    await expect(controller.add({ ipAddress: '192.0.2.7' })).resolves.toMatchObject({
      name: '192.0.2.7',
      generation: null,
      model: null,
      authState: 'unknown',
      lastProbeError: 'Timed out',
      lastProbeAt: expect.any(String),
    });
  });

  it('retains known metadata on failed re-probes and replaces it after recovery', async () => {
    const device = { id: 7, ipAddress: '192.0.2.7', generation: 1, model: 'Relay', authState: 'required' };
    registry.findById.mockResolvedValue(device);
    probe.probe
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ generation: 2, model: 'Plus1', authState: 'none' });
    await expect(controller.reprobe(7)).resolves.toBe(device);
    expect(registry.updateProbe).toHaveBeenLastCalledWith(7, {
      generation: 1,
      model: 'Relay',
      authState: 'required',
      lastProbeAt: expect.any(String),
      lastProbeError: 'Offline',
    });
    await controller.reprobe(7);
    expect(registry.updateProbe).toHaveBeenLastCalledWith(7, {
      generation: 2,
      model: 'Plus1',
      authState: 'none',
      lastProbeAt: expect.any(String),
      lastProbeError: null,
    });
    registry.findById.mockResolvedValue(null);
    await expect(controller.reprobe(7)).rejects.toBeInstanceOf(NotFoundException);
  });
});
