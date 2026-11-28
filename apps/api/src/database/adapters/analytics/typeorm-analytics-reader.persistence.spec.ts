import { Resource, ResourceOperatingInterval, ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmAnalyticsReader } from './typeorm-analytics-reader';

jest.setTimeout(60_000);

/** The range queries of the analytics reader against the real schema: aliases, subqueries and grouped counts. */
describe('TypeOrmAnalyticsReader on real PostgreSQL', () => {
  let source: DataSource;
  let reader: TypeOrmAnalyticsReader;
  const at = (iso: string) => new Date(`2026-09-${iso}Z`);
  const params = {
    start: at('10T00:00:00'),
    asOf: at('20T00:00:00'),
    action: ResourceUsageAction.Usage,
    pending: false,
  };

  beforeEach(async () => {
    source = await createTestDataSource();
    reader = new TypeOrmAnalyticsReader(
      source.getRepository(ResourceUsage),
      source.getRepository('BillingTransaction'),
      source.getRepository(Resource),
    );
    await source.getRepository(Resource).save([
      { name: 'Idle', type: ResourceType.Machine },
      { name: 'Used', type: ResourceType.Machine },
      { name: 'Operated', type: ResourceType.Machine },
      { name: 'Before', type: ResourceType.Machine },
    ]);
    await source.getRepository(User).save({ username: 'alice', email: 'alice@example.test' });
    const usage = (resourceId: number, start: string, end: string | null, extra: Partial<ResourceUsage> = {}) =>
      ({
        resourceId,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        isFinalized: true,
        startTime: at(start),
        endTime: end ? at(end) : null,
        ...extra,
      }) as ResourceUsage;
    await source.getRepository(ResourceUsage).save([
      usage(2, '12T08:00:00', '12T09:00:00'),
      usage(2, '15T08:00:00', null),
      // pending reservation and door action never count
      usage(2, '16T08:00:00', null, { isFinalized: false, lifecyclePending: true }),
      usage(2, '16T09:00:00', '16T09:01:00', { usageAction: ResourceUsageAction.DoorUnlock }),
      // ended before the range
      usage(4, '01T08:00:00', '02T09:00:00'),
    ]);
    await source
      .getRepository(ResourceOperatingInterval)
      .save({ resourceId: 3, startTime: at('11T00:00:00'), endTime: at('11T05:00:00') });
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('lists the resources with usage or operation in the range, page by page, by id', async () => {
    const { resources, total } = await reader.findResourcesActiveInRange(params, 1, 10);

    expect(resources.map((resource) => resource.name)).toEqual(['Used', 'Operated']);
    expect(total).toBe(2);
    const second = await reader.findResourcesActiveInRange(params, 2, 1);
    expect(second.resources.map((resource) => resource.name)).toEqual(['Operated']);
  });

  it('counts the sessions overlapping the range per resource', async () => {
    const counts = await reader.countSessionsInRange([1, 2, 3, 4], params);

    expect(counts).toEqual(new Map([[2, 2]]));
  });

  it('counts a session with a switched project once, whichever of its parts the range covers', async () => {
    const part = { resourceId: 1, userId: 1, usageAction: ResourceUsageAction.Usage, isFinalized: true };
    const first = await source
      .getRepository(ResourceUsage)
      .save({ ...part, startTime: at('12T08:00:00'), endTime: at('12T10:00:00') });
    await source
      .getRepository(ResourceUsage)
      .save({ ...part, startTime: at('12T10:00:00'), endTime: at('12T12:00:00'), previousUsageId: first.id });
    const count = async (start: string, asOf: string) =>
      (await reader.countSessionsInRange([1], { ...params, start: at(start), asOf: at(asOf) })).get(1);

    expect(await count('12T00:00:00', '13T00:00:00')).toBe(1);
    // only the part before the switch, also with the range ending exactly at the switch
    expect(await count('12T07:00:00', '12T09:00:00')).toBe(1);
    expect(await count('12T07:00:00', '12T10:00:00')).toBe(1);
    // only the continuation, also with the range starting exactly at the switch
    expect(await count('12T10:00:00', '12T13:00:00')).toBe(1);
    expect(await count('12T11:00:00', '12T13:00:00')).toBe(1);
  });

  it('finds the first activity start of a set of resources inside the range', async () => {
    expect(await reader.findFirstActivityStart([2, 3], params.start, params.asOf)).toEqual(at('11T00:00:00'));
    expect(await reader.findFirstActivityStart([1, 4], params.start, params.asOf)).toBeNull();
  });
});
