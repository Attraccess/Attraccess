import { Resource, ResourceUsage, ResourceUsageLifecycleAttempt, User } from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction, SupervisionMode } from '@attraccess/application-models';
import { createMigratedUsageDatabase, insertProject, userRow } from './migrated-usage-database.test-fixture';

jest.setTimeout(30_000);

/**
 * What the service specs take for granted of the usage session store (their fake keeps sessions in memory): which
 * sessions count as running, what the history and the details show, and what ends once. Against real SQLite, with a
 * second connection standing for another API instance.
 */
describe('TypeOrmUsageSessionStore reads and ends', () => {
  let database: Awaited<ReturnType<typeof createMigratedUsageDatabase>>;
  type Instance = Awaited<ReturnType<typeof database.connect>>;
  let a: Instance;
  let b: Instance;

  const at = (minute: number) => new Date(Date.UTC(2026, 7, 28, 10, minute));
  /** A stored session; by default a published, running usage of user 1 on machine 1. */
  const stored = (id: number, fields: Partial<ResourceUsage> = {}) =>
    a.source.getRepository(ResourceUsage).save({
      id,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: at(id),
      endTime: null,
      isFinalized: true,
      lifecyclePending: false,
      ...fields,
    } as ResourceUsage);

  beforeEach(async () => {
    // The schema, its unique indexes and triggers come from the released migrations.
    database = await createMigratedUsageDatabase('attraccess-usage-reads-');
    a = await database.connect();
    await a.source.getRepository(Resource).save([
      { id: 1, name: 'Printer', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
      { id: 2, name: 'Saw', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
      { id: 3, name: 'Door', type: ResourceType.Door, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
    ]);
    await a.source.getRepository(User).save([1, 2, 3].map((id) => userRow(id)));
    await insertProject(a.source, { id: 9, name: 'Thesis', ownerId: 1 });
    b = await database.connect();
  });

  afterEach(async () => {
    await database.close();
  });

  describe('running sessions', () => {
    beforeEach(async () => {
      await stored(1, { userId: 1 });
      await stored(2, { userId: 2, supervisorUserId: 3 });
      await stored(3, { userId: 1, endTime: at(30) });
      await stored(4, { userId: 3, isFinalized: false, lifecyclePending: true });
      await stored(5, { userId: 1, usageAction: ResourceUsageAction.DoorUnlock, resourceId: 3, endTime: at(5) });
      await stored(6, { userId: 1, resourceId: 2 });
    });

    it('are only the published, unfinished usages of that machine, earliest started first, with their relations', async () => {
      const sessions = await a.store.findActiveSessions(1);

      expect(sessions.map((session) => session.id)).toEqual([1, 2]);
      expect(sessions[1]).toMatchObject({
        user: { id: 2 },
        resource: { id: 1 },
        supervisorUser: { id: 3 },
        billingTransaction: null,
        project: null,
      });
      expect(await a.store.countActiveSessions(1)).toBe(2);
      expect(await a.store.findActiveSessions(3)).toEqual([]);
    });

    it('can be listed for several machines at once, including machines without a session', async () => {
      const byResource = await a.store.findActiveSessionsByResource([1, 2, 3]);

      expect([...byResource].map(([id, sessions]) => [id, sessions.map((session) => session.id)])).toEqual([
        [1, [1, 2]],
        [2, [6]],
        [3, []],
      ]);
    });

    it('count in the slots a start may take together with pending starts, never with ended ones', async () => {
      expect(await a.store.countOccupiedSlots(1)).toBe(3);
      expect([...(await a.store.findOccupyingUserIds(1))].sort()).toEqual([1, 2, 3]);
    });

    it('are visible to another instance as soon as the first one committed their publication', async () => {
      const [pending] = await a.unitOfWork.run(async (scope) => [
        await a.store.createPendingSession(
          {
            resourceId: 2,
            userId: 2,
            startNotes: undefined,
            startTime: at(40),
            sessionDurationCreditsPerMinute: 0,
            operatingDurationCreditsPerMinute: 0,
            creditsPerUsage: 0,
            meterRates: [],
          },
          scope,
        ),
      ]);
      expect((await b.store.findActiveSessions(2)).map((session) => session.id)).toEqual([6]);

      await a.store.publishSession(pending.id);

      expect((await b.store.findActiveSessions(2)).map((session) => session.id)).toEqual([6, pending.id]);
    });
  });

  describe('details and history', () => {
    beforeEach(async () => {
      await stored(1, { userId: 1, endTime: at(20), endNotes: 'first', projectId: 9 });
      await stored(2, { userId: 2, endTime: at(21) });
      await stored(3, { userId: 1, isFinalized: false, lifecyclePending: true });
      await stored(4, { userId: 1, resourceId: 2 });
    });

    it('show a published session with its user, project and supervisor, never a pending one or one of another machine', async () => {
      expect(await a.store.findPublishedSession(1, 1)).toMatchObject({
        id: 1,
        user: { id: 1 },
        project: { id: 9 },
        formSubmissions: [],
      });
      expect(await a.store.findPublishedSession(1, 3)).toBeNull();
      expect(await a.store.findPublishedSession(1, 4)).toBeNull();
    });

    it('list the published sessions newest first, a page at a time, optionally of one user', async () => {
      const all = await a.store.findHistory(1, 1, 10);
      expect(all.data.map((session) => session.id)).toEqual([2, 1]);
      expect(all.total).toBe(2);

      const secondPage = await a.store.findHistory(1, 2, 1);
      expect(secondPage.data.map((session) => session.id)).toEqual([1]);
      expect(secondPage.total).toBe(2);

      const own = await a.store.findHistory(1, 1, 10, 2);
      expect(own.data.map((session) => session.id)).toEqual([2]);
      expect(own.total).toBe(1);
    });

    it('show a session that was just ended, with its end notes, to every instance', async () => {
      await stored(5, { userId: 1 });

      await a.unitOfWork.run((scope) =>
        a.store.endSessionIfOpen(5, { endTime: at(50), endNotes: 'Ended by flow' }, scope),
      );

      const history = await b.store.findHistory(1, 1, 10, 1);
      expect(history.data[0]).toMatchObject({ id: 5, endNotes: 'Ended by flow' });
      expect(history.data[0].usageInMinutes).toBeCloseTo(45);
    });

    it('move an ended session to a project and out of it again, returning it with resource, user and project', async () => {
      const session = await a.store.findSessionForProjectChange(1, 2);
      expect(session).toMatchObject({ id: 2, user: { id: 2 }, resource: { id: 1 }, project: null });

      expect(await a.store.assignProject(2, 9)).toMatchObject({
        id: 2,
        projectId: 9,
        project: { id: 9 },
      });
      expect(await a.store.assignProject(2, null)).toMatchObject({ id: 2, projectId: null, project: null });
      expect(await a.store.findSessionForProjectChange(2, 2)).toBeNull();
    });
  });

  describe('stops', () => {
    it('only offer a running session that no stop attempt is already ending', async () => {
      await stored(1);
      await stored(2, { userId: 2 });
      await a.source.getRepository(ResourceUsageLifecycleAttempt).save({
        id: 'attempt-1',
        resourceId: 1,
        kind: 'end',
        candidateUsageId: null,
        previousUsageId: 1,
        transitionTime: at(30),
        formSubmissions: [],
        billingItems: [],
      } as never);

      expect(await b.store.findEndableSession(1, 1)).toBeNull();
      expect(await b.store.findEndableSession(1, 2)).toMatchObject({ id: 2, user: { id: 2 } });
      expect(await b.store.findSessionIdsBeingEnded(1)).toEqual(new Set([1]));
    });

    it('end a session once and report the second end, whichever instance asks', async () => {
      await stored(1);

      const ends = await Promise.all(
        [a, b].map((instance) =>
          instance.unitOfWork.run((scope) =>
            instance.store.endSessionIfOpen(1, { endTime: at(31), endNotes: 'stop' }, scope),
          ),
        ),
      );

      expect(ends.filter(Boolean)).toHaveLength(1);
      expect(await a.store.findActiveSessions(1)).toEqual([]);
    });
  });

  describe('completed supervised sessions', () => {
    it('count a session switched twice (three parts) once, and an unswitched one once', async () => {
      const supervised = { userId: 1, supervisorUserId: 3 };
      await stored(1, { ...supervised, endTime: at(10) });
      await stored(2, { ...supervised, startTime: at(10), endTime: at(20), previousUsageId: 1 });
      await stored(3, { ...supervised, startTime: at(20), endTime: at(30), previousUsageId: 2 });
      await stored(4, { ...supervised, endTime: at(40) }); // never switched
      await stored(5, { userId: 1, endTime: at(50) }); // not supervised

      expect(await a.store.countCompletedSupervisedSessions([1], 1)).toBe(2);
    });

    it('do not count a chain whose last part still runs', async () => {
      const supervised = { userId: 1, supervisorUserId: 3 };
      await stored(1, { ...supervised, endTime: at(10) });
      await stored(2, { ...supervised, startTime: at(10), previousUsageId: 1 });

      expect(await a.store.countCompletedSupervisedSessions([1], 1)).toBe(0);
    });
  });

  describe('door actions', () => {
    it('are stored as already ended sessions of the user that never count as running', async () => {
      const unlock = await a.store.recordDoorAction({
        resourceId: 3,
        userId: 2,
        action: ResourceUsageAction.DoorUnlock,
      });

      expect(unlock).toMatchObject({
        resourceId: 3,
        usageAction: ResourceUsageAction.DoorUnlock,
        user: { id: 2 },
        resource: { id: 3 },
      });
      expect(unlock.endTime).toBeInstanceOf(Date);
      expect(await a.store.findActiveSessions(3)).toEqual([]);
      expect(await a.store.countOccupiedSlots(3)).toBe(0);
    });
  });
});
