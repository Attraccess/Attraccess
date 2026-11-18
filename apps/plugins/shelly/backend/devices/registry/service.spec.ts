import {
  createInMemoryPluginStorage,
  PluginStorageUniqueViolation,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService, type DeviceProbeFields } from './service';
import { shellyStorage } from './storage';

const probe = (overrides: Partial<DeviceProbeFields> = {}): DeviceProbeFields => ({
  generation: 2,
  model: 'SNSW-001P16EU',
  authState: 'none',
  lastProbeAt: '2026-01-01T00:00:00.000Z',
  lastProbeError: null,
  ...overrides,
});

function setup() {
  const fake = createInMemoryPluginStorage(shellyStorage);
  const open = jest.spyOn(fake.storage, 'open');
  const context = { storage: fake.storage } as unknown as PluginContext;
  return { registry: new DeviceRegistryService(context), open };
}

describe('DeviceRegistryService', () => {
  it('opens the storage only on first use, then reuses it', async () => {
    const { registry, open } = setup();
    expect(open).not.toHaveBeenCalled();
    await registry.list();
    await registry.findById(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(shellyStorage);
  });

  it('adds a device with its probe fields and finds it by id and address', async () => {
    const { registry } = setup();
    const created = await registry.create({ name: 'Lathe', ipAddress: '192.168.1.20', ...probe() });
    expect(created).toMatchObject({
      id: expect.any(Number),
      name: 'Lathe',
      ipAddress: '192.168.1.20',
      generation: 2,
      model: 'SNSW-001P16EU',
      authState: 'none',
      lastProbeError: null,
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(await registry.findById(created.id)).toEqual(created);
    expect(await registry.findByIp('192.168.1.20')).toEqual(created);
    expect(await registry.findByIp('192.168.1.21')).toBeNull();
    expect(await registry.findById(created.id + 1)).toBeNull();
  });

  it('refuses a second device on the same address with a unique violation', async () => {
    const { registry } = setup();
    await registry.create({ name: 'First', ipAddress: '10.0.0.5', ...probe() });
    await expect(registry.create({ name: 'Second', ipAddress: '10.0.0.5', ...probe() })).rejects.toBeInstanceOf(
      PluginStorageUniqueViolation,
    );
    expect((await registry.list()).map((device) => device.name)).toEqual(['First']);
  });

  it('lets exactly one of two concurrent adds of the same address win', async () => {
    const { registry } = setup();
    const results = await Promise.allSettled([
      registry.create({ name: 'A', ipAddress: '10.0.0.6', ...probe() }),
      registry.create({ name: 'B', ipAddress: '10.0.0.6', ...probe() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(PluginStorageUniqueViolation);
    expect(await registry.list()).toHaveLength(1);
  });

  it('stores a name, model and probe error longer than 255 characters', async () => {
    const { registry } = setup();
    // The name is entered by an operator, the model reported by the device and the error built from the address
    // and the failure: none is length-checked, and the legacy columns are unbounded.
    const long = (prefix: string) => `${prefix}${'x'.repeat(300)}`;
    const created = await registry.create({
      name: long('name-'),
      ipAddress: '10.0.0.7',
      ...probe({ model: long('model-'), lastProbeError: long('probe failed: ') }),
    });
    expect(await registry.findById(created.id)).toMatchObject({
      name: long('name-'),
      model: long('model-'),
      lastProbeError: long('probe failed: '),
    });
  });

  it('records a re-probe and an auth change and moves updatedAt', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    try {
      const { registry } = setup();
      const created = await registry.create({ name: 'Mill', ipAddress: '10.0.0.8', ...probe() });
      jest.setSystemTime(new Date('2026-01-01T00:05:00.000Z'));
      await registry.updateProbe(
        created.id,
        probe({ generation: null, model: null, authState: 'unknown', lastProbeError: 'timeout' }),
      );
      expect(await registry.findById(created.id)).toMatchObject({
        generation: null,
        model: null,
        authState: 'unknown',
        lastProbeError: 'timeout',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:05:00.000Z',
      });
      jest.setSystemTime(new Date('2026-01-01T00:10:00.000Z'));
      await registry.updateAuthState(created.id, 'required');
      expect(await registry.findById(created.id)).toMatchObject({
        authState: 'required',
        updatedAt: '2026-01-01T00:10:00.000Z',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists by creation time, then id, and deletes a device', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    try {
      const { registry } = setup();
      const late = await registry.create({ name: 'Late', ipAddress: '10.0.0.9', ...probe() });
      jest.setSystemTime(new Date('2025-12-31T00:00:00.000Z'));
      const early = await registry.create({ name: 'Early', ipAddress: '10.0.0.10', ...probe() });
      const sameTime = await registry.create({ name: 'Same', ipAddress: '10.0.0.11', ...probe() });
      expect((await registry.list()).map((device) => device.id)).toEqual([early.id, sameTime.id, late.id]);
      await registry.delete(early.id);
      expect((await registry.list()).map((device) => device.id)).toEqual([sameTime.id, late.id]);
      // Deleting a missing device is a no-op.
      await registry.delete(early.id);
      expect(await registry.list()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
