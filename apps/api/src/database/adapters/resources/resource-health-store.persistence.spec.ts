import { DataSource } from 'typeorm';
import { entities, Resource } from '@attraccess/database-entities';
import { ResourceHealthSource, ResourceHealthStatus, ResourceType } from '@attraccess/application-models';
import { TypeOrmResourceHealthStore } from './resource-health-store.adapter';

describe('TypeOrmResourceHealthStore on real SQLite', () => {
  let source: DataSource;
  let store: TypeOrmResourceHealthStore;
  let resourceId: number;

  const report = (identifier: string, status: ResourceHealthStatus, reason: string | null = null) => ({
    resourceId,
    identifier,
    status,
    reason,
    source: ResourceHealthSource.MANUAL,
    lastReportedAt: new Date('2030-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: Object.values(entities),
    }).initialize();
    store = new TypeOrmResourceHealthStore(source);
    const resources = source.getRepository(Resource);
    resourceId = (await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }))).id;
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('keeps one entry per identifier and reports the previous status', async () => {
    const first = await store.upsertReport(report('ir', ResourceHealthStatus.HEALTHY));
    expect(first.previousStatus).toBeNull();

    const second = await store.upsertReport(report('ir', ResourceHealthStatus.UNHEALTHY, 'gone'));
    expect(second.previousStatus).toBe(ResourceHealthStatus.HEALTHY);
    expect(second.record).toMatchObject({
      id: first.record.id,
      reason: 'gone',
      status: ResourceHealthStatus.UNHEALTHY,
    });

    await store.upsertReport(report('', ResourceHealthStatus.HEALTHY));
    expect((await store.listForResource(resourceId)).map((entry) => entry.identifier)).toEqual(['', 'ir']);
    expect(Object.keys(second.record).sort()).toEqual(
      ['id', 'identifier', 'lastReportedAt', 'reason', 'resourceId', 'source', 'status'].sort(),
    );
  });

  it('answers unhealthy checks on the application connection and inside a transaction', async () => {
    expect(await store.hasUnhealthyEntry(resourceId)).toBe(false);
    await source.transaction(async (manager) => {
      await store.upsertReport(report('ir', ResourceHealthStatus.UNHEALTHY, 'gone'));
      expect(await store.hasUnhealthyEntry(resourceId, manager)).toBe(true);
    });
    expect(await store.hasUnhealthyEntry(resourceId)).toBe(true);
  });

  it('finds and removes an entry of its own resource only', async () => {
    const { record } = await store.upsertReport(report('ir', ResourceHealthStatus.UNHEALTHY, 'gone'));

    expect(await store.findEntry(resourceId + 1, record.id)).toBeNull();
    expect(await store.findEntry(resourceId, record.id)).toMatchObject({ identifier: 'ir' });
    expect(await store.listForResources([resourceId, 999])).toHaveLength(1);
    expect(await store.resourceExists(resourceId)).toBe(true);
    expect(await store.resourceExists(999)).toBe(false);

    await store.removeEntry(record.id);
    expect(await store.listForResource(resourceId)).toEqual([]);
  });
});
