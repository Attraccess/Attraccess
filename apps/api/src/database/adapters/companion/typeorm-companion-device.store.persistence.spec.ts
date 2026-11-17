import { CompanionDevice, Resource, ResourceFlowNode, entities } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { TypeOrmCompanionDeviceStore } from './typeorm-companion-device.store';

describe('TypeOrmCompanionDeviceStore on real SQLite', () => {
  let source: DataSource;
  let store: TypeOrmCompanionDeviceStore;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    store = new TypeOrmCompanionDeviceStore(
      source.getRepository(CompanionDevice),
      source.getRepository(ResourceFlowNode),
    );
  });

  afterEach(() => source.destroy());

  it('registers, finds, renames, locks and deletes a device with neutral records', async () => {
    const created = await store.registerDevice({ name: 'abcd', tokenHash: 'hash' });
    expect(created).toMatchObject({ name: 'abcd', tokenHash: 'hash', locked: false, appVersion: null, resources: [] });

    await store.recordConnection(created.id, '1.2.3');
    await store.setLocked(created.id, true);
    const found = await store.findDevice(created.id);
    expect(found).toMatchObject({ id: created.id, locked: true, appVersion: '1.2.3' });
    expect(found?.lastConnection).toBeInstanceOf(Date);

    expect((await store.renameDevice(created.id, 'Desk PC')).name).toBe('Desk PC');
    expect(await store.listDevices()).toHaveLength(1);

    await store.deleteDevice(created.id);
    expect(await store.findDevice(created.id)).toBeNull();
  });

  it('keeps the app version when a connection reports none', async () => {
    const device = await store.registerDevice({ name: 'abcd', tokenHash: 'hash' });
    await store.recordConnection(device.id, '1.0.0');
    await store.recordConnection(device.id);
    expect((await store.findDevice(device.id))?.appVersion).toBe('1.0.0');
  });

  it('finds the distinct resources whose companion flow nodes reference the device', async () => {
    const resources = source.getRepository(Resource);
    const { id: resourceA } = await resources.save({ name: 'Printer', type: ResourceType.Machine });
    const { id: resourceB } = await resources.save({ name: 'Laser', type: ResourceType.Machine });
    let counter = 0;
    const node = (resourceId: number, type: string, deviceId: number) =>
      source.getRepository(ResourceFlowNode).save({
        id: `node-${counter++}`,
        resourceId,
        type: type as ResourceFlowNode['type'],
        position: { x: 0, y: 0 },
        data: { deviceId },
      });
    await node(resourceA, 'output.companion.lock-pc', 7);
    await node(resourceA, 'output.companion.unlock-pc', 7);
    await node(resourceB, 'output.companion.lock-pc', 8);
    await node(resourceB, 'output.mqtt.publish', 7);

    expect(await store.findResourcesControlledBy(7)).toEqual([{ id: resourceA, name: 'Printer' }]);
    expect(await store.findResourcesControlledBy(99)).toEqual([]);
  });
});
