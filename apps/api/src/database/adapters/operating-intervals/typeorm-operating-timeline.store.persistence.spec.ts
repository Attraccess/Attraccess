import {
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction, SupervisionMode } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { TypeOrmOperatingTimelineStore } from './typeorm-operating-timeline.store';

const at = (time: string) => new Date(`2026-08-28T${time}.000Z`);

/** The reads of the operating timeline against a real database: window semantics, filters and mapping. */
describe('TypeOrmOperatingTimelineStore reads', () => {
  let source: DataSource;
  let store: TypeOrmOperatingTimelineStore;

  const interval = (resourceId: number, start: string, end: string | null) =>
    source.getRepository(ResourceOperatingInterval).save({ resourceId, startTime: at(start), endTime: end && at(end) });
  const usage = (resourceId: number, start: string, end: string | null, extra: Partial<ResourceUsage> = {}) =>
    source.getRepository(ResourceUsage).save({
      resourceId,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: at(start),
      endTime: end && at(end),
      isFinalized: true,
      operatingDurationCreditsPerMinute: 3,
      ...extra,
    } as ResourceUsage);

  beforeEach(async () => {
    source = await createTestDataSource();
    await source.getRepository(Resource).save([
      { name: 'Printer', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
      { name: 'Saw', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
    ]);
    await source.getRepository(User).save({ username: 'user', email: 'user@example.test' });
    const unitOfWork = unitOfWorkFor(source);
    store = new TypeOrmOperatingTimelineStore(unitOfWork, new EntityManagerResolver(unitOfWork, source));
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('lists intervals overlapping each resource window, open ones included, earliest first', async () => {
    await interval(1, '09:00:00', '09:30:00'); // ends before the window
    await interval(1, '09:50:00', '10:10:00'); // overlaps the start
    await interval(1, '11:00:00', null); // open
    await interval(1, '12:30:00', '13:00:00'); // starts after the end
    await interval(2, '09:00:00', '10:30:00'); // window of resource 2 starts later

    const rows = await store.findIntervals(
      [
        { resourceId: 1, from: at('10:00:00') },
        { resourceId: 2, from: at('10:45:00') },
      ],
      at('12:00:00'),
    );

    expect(rows.map(({ resourceId, startTime }) => [resourceId, startTime.toISOString().slice(11, 19)])).toEqual([
      [1, '09:50:00'],
      [1, '11:00:00'],
    ]);
    expect(rows[1]).toEqual(expect.objectContaining({ endTime: null, startFlowNodeId: null }));
  });

  it('lists only started usage sessions, not door actions or pending reservations, and can leave one out', async () => {
    const first = await usage(1, '10:00:00', '10:30:00');
    const second = await usage(1, '10:20:00', null);
    await usage(1, '10:10:00', '10:11:00', { usageAction: ResourceUsageAction.DoorUnlock });
    await usage(1, '10:15:00', null, { lifecyclePending: true, isFinalized: false });
    await usage(2, '10:15:00', null);

    const windows = [{ resourceId: 1, from: at('10:00:00') }];
    const all = await store.findSessions(windows, at('11:00:00'));
    const others = await store.findSessions(windows, at('11:00:00'), { excludeUsageId: first.id });

    expect(all.map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(others.map(({ id }) => id)).toEqual([second.id]);
    expect(all[0]).toEqual({
      id: first.id,
      resourceId: 1,
      usageAction: ResourceUsageAction.Usage,
      lifecyclePending: false,
      startTime: at('10:00:00'),
      endTime: at('10:30:00'),
      operatingDurationCreditsPerMinute: 3,
    });
  });

  it('reads inside the transaction the caller holds', async () => {
    const unitOfWork = unitOfWorkFor(source);
    const inScope = new TypeOrmOperatingTimelineStore(unitOfWork, new EntityManagerResolver(unitOfWork, source));

    const seen = await unitOfWork.run(async (scope) => {
      await unitOfWork
        .handleOf(scope)
        .getRepository(ResourceOperatingInterval)
        .save({ resourceId: 1, startTime: at('10:00:00'), endTime: null });
      return inScope.findIntervals([{ resourceId: 1, from: at('09:00:00') }], at('12:00:00'), scope);
    });
    expect(seen).toHaveLength(1);

    await expect(
      unitOfWork.run(async (scope) => {
        await unitOfWork
          .handleOf(scope)
          .getRepository(ResourceOperatingInterval)
          .save({ resourceId: 2, startTime: at('10:00:00'), endTime: null });
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await store.findResourcesWithIntervals([1, 2])).toEqual(new Set([1]));
  });

  it('reports the stops and takeovers that are requested but not stored yet', async () => {
    const repository = source.getRepository(ResourceUsageLifecycleAttempt);
    const base = { formSubmissions: [], billingItems: [], transitionTime: at('10:30:00') };
    await repository.save({ id: 'a', resourceId: 1, kind: 'end', previousUsageId: 7, candidateUsageId: null, ...base });
    await repository.save({
      id: 'b',
      resourceId: 1,
      kind: 'takeover',
      previousUsageId: 8,
      candidateUsageId: 9,
      ...base,
    });
    await repository.save({
      id: 'c',
      resourceId: 1,
      kind: 'start',
      previousUsageId: null,
      candidateUsageId: 10,
      ...base,
    });
    await repository.save({
      id: 'd',
      resourceId: 2,
      kind: 'end',
      previousUsageId: 11,
      candidateUsageId: null,
      ...base,
    });

    expect(await store.findPendingSessionEnds([1])).toEqual(
      new Map([
        [7, at('10:30:00')],
        [8, at('10:30:00')],
      ]),
    );
  });

  it('pages intervals newest first and reports the current state and open count', async () => {
    await interval(1, '08:00:00', '08:30:00');
    await interval(1, '09:00:00', '09:30:00');
    const open = await interval(1, '10:00:00', null);

    const page = await store.pageIntervals(1, 2, 2);
    const state = await store.findCurrentState(1);

    expect(page.total).toBe(3);
    expect(page.intervals.map(({ startTime }) => startTime.toISOString().slice(11, 16))).toEqual(['08:00']);
    expect(state.open?.id).toBe(open.id);
    expect(state.latest?.id).toBe(open.id);
    expect(await store.countOpenIntervals(1)).toBe(1);
    expect((await store.findIntervalsActiveSince(1, at('09:15:00'))).map(({ id }) => id)).toEqual([
      expect.any(Number),
      open.id,
    ]);
    expect(await store.findCurrentState(2)).toEqual({ open: null, latest: null });
  });
});
