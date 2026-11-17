import { Resource, User } from '@attraccess/database-entities';
import { ResourceType, SupervisionMode } from '@attraccess/application-models';
import type { UsageLifecycleAttempt } from '@attraccess/application-models';
import { PendingSessionDraft } from '../../../resources/usage/usage-session-store.port';
import { isUniqueViolation } from '../../persistence-errors';
import { createMigratedUsageDatabase, userRow } from './migrated-usage-database.test-fixture';

jest.setTimeout(30_000);

/**
 * The guarantees of the usage session store against a real database, with two independent connections to one
 * file: what the application relies on when several API instances (or several requests) change one machine.
 */
describe('TypeOrmUsageSessionStore with two independent connections', () => {
  let database: Awaited<ReturnType<typeof createMigratedUsageDatabase>>;
  /** One API instance: its own connection, unit of work and store. */
  type Instance = Awaited<ReturnType<typeof database.connect>>;
  let a: Instance;
  let b: Instance;

  const draft = (userId: number, resourceId = 1): PendingSessionDraft => ({
    resourceId,
    userId,
    startNotes: undefined,
    startTime: new Date('2026-08-28T10:00:00.000Z'),
    sessionDurationCreditsPerMinute: 2,
    operatingDurationCreditsPerMinute: 3,
    creditsPerUsage: 5,
    meterRates: [{ meterId: 1, name: 'Energy', creditsPerUnit: 4 }],
  });
  const attempt = (id: string, extra: Partial<UsageLifecycleAttempt>): UsageLifecycleAttempt => ({
    id,
    resourceId: 1,
    kind: 'end',
    candidateUsageId: null,
    previousUsageId: null,
    transitionTime: new Date('2026-08-28T11:00:00.000Z'),
    formSubmissions: [],
    billingItems: [],
    ...extra,
  });
  /** A reservation that was committed and published, as a start leaves it. */
  const publishedSession = async (instance: Instance, userId: number, resourceId = 1) =>
    instance.unitOfWork.run(async (scope) => {
      const session = await instance.store.createPendingSession(draft(userId, resourceId), scope);
      await instance.store.publishSession(session.id, scope);
      return session;
    });
  const outcomes = (results: PromiseSettledResult<unknown>[]) => ({
    fulfilled: results.filter((result) => result.status === 'fulfilled').length,
    rejected: results.filter((result): result is PromiseRejectedResult => result.status === 'rejected'),
  });

  beforeEach(async () => {
    // The schema, its unique indexes and triggers come from the released migrations, so index drift is caught.
    database = await createMigratedUsageDatabase('attraccess-usage-store-');
    a = await database.connect();
    await a.source.getRepository(Resource).save([
      { id: 1, name: 'Printer', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
      { id: 2, name: 'Saw', type: ResourceType.Machine, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED },
    ]);
    await a.source.getRepository(User).save([1, 2, 3].map((id) => userRow(id)));
    b = await database.connect();
  });

  afterEach(async () => {
    await database.close();
  });

  it('cannot create two reservations for the same person on one machine, whichever instance asks', async () => {
    const results = await Promise.allSettled(
      [a, b, a, b, a, b].map((instance) =>
        instance.unitOfWork.run((scope) => instance.store.createPendingSession(draft(1), scope)),
      ),
    );

    const { fulfilled, rejected } = outcomes(results);
    expect(fulfilled).toBe(1);
    expect(rejected).toHaveLength(5);
    rejected.forEach((result) => expect(isUniqueViolation(result.reason)).toBe(true));
    expect(await a.store.countOccupiedSlots(1)).toBe(1);
  });

  it('lets different people and different machines reserve at the same time', async () => {
    const results = await Promise.allSettled([
      a.unitOfWork.run((scope) => a.store.createPendingSession(draft(1), scope)),
      b.unitOfWork.run((scope) => b.store.createPendingSession(draft(2), scope)),
      a.unitOfWork.run((scope) => a.store.createPendingSession(draft(1, 2), scope)),
      b.unitOfWork.run((scope) => b.store.createPendingSession(draft(3, 2), scope)),
    ]);

    expect(outcomes(results).fulfilled).toBe(4);
    expect(await a.store.findOccupyingUserIds(1)).toEqual(expect.arrayContaining([1, 2]));
    expect(await b.store.countOccupiedSlots(2)).toBe(2);
  });

  it('finalizes an ending session exactly once when two instances end it at the same time', async () => {
    const session = await publishedSession(a, 1);
    const end = (instance: Instance, notes: string) =>
      instance.unitOfWork.run((scope) =>
        instance.store.endSessionIfOpen(session.id, { endTime: new Date(), endNotes: notes }, scope),
      );

    const results = await Promise.all([end(a, 'by a'), end(b, 'by b'), end(a, 'again a'), end(b, 'again b')]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const ended = await a.store.findSessionWithRelations(session.id, 'ended');
    expect(ended.endTime).not.toBeNull();
    expect(['by a', 'by b']).toContain(ended.endNotes);
    expect(await a.store.countActiveSessions(1)).toBe(0);
  });

  it('allows one stop or takeover attempt per running session and one attempt per tentative session', async () => {
    const running = await publishedSession(a, 1);
    const tentative = await a.unitOfWork.run((scope) => a.store.createPendingSession(draft(2), scope));

    const stops = await Promise.allSettled(
      [a, b, a, b].map((instance, index) =>
        instance.unitOfWork.run((scope) =>
          instance.store.saveAttempt(attempt(`stop-${index}`, { previousUsageId: running.id }), scope),
        ),
      ),
    );
    const takeovers = await Promise.allSettled(
      [a, b].map((instance, index) =>
        instance.unitOfWork.run((scope) =>
          instance.store.saveAttempt(
            attempt(`start-${index}`, { kind: 'start', candidateUsageId: tentative.id }),
            scope,
          ),
        ),
      ),
    );

    expect(outcomes(stops).fulfilled).toBe(1);
    outcomes(stops).rejected.forEach((result) => expect(isUniqueViolation(result.reason)).toBe(true));
    expect(outcomes(takeovers).fulfilled).toBe(1);
    expect(await b.store.isSessionBeingEnded(running.id)).toBe(true);
    expect(await a.store.isLifecycleBlocked(1, false)).toBe(true);
    expect(await a.store.isLifecycleBlocked(2, false)).toBe(false);
  });

  it('leaves nothing behind when a start fails after it reserved the machine', async () => {
    await expect(
      a.unitOfWork.run(async (scope) => {
        const reserved = await a.store.createPendingSession(draft(1), scope);
        await a.store.saveAttempt(attempt('start-1', { kind: 'start', candidateUsageId: reserved.id }), scope);
        throw new Error('the bill could not be prepared');
      }),
    ).rejects.toThrow('the bill could not be prepared');

    expect(await b.store.countOccupiedSlots(1)).toBe(0);
    expect(await b.store.findAttempt('start-1', 1)).toBeNull();
    expect(await b.store.isLifecycleBlocked(1, false)).toBe(false);
  });

  it('keeps the price snapshot, the meter rates and the owner billing factor of a reservation', async () => {
    await a.source.getRepository(User).update(1, { billingFactor: 50 });

    const reserved = await a.unitOfWork.run((scope) => a.store.createPendingSession(draft(1), scope));
    const stored = await b.store.findSessionWithRelations(reserved.id, 'started');

    expect(stored).toMatchObject({
      sessionDurationCreditsPerMinute: 2,
      operatingDurationCreditsPerMinute: 3,
      creditsPerUsage: 5,
      billingFactor: 50,
      lifecyclePending: true,
      isFinalized: false,
      meterRates: [{ meterId: 1, name: 'Energy', creditsPerUnit: 4 }],
    });
  });

  it('only ever removes a tentative session, never a published one', async () => {
    const published = await publishedSession(a, 1);
    const tentative = await a.unitOfWork.run((scope) => a.store.createPendingSession(draft(2), scope));

    const removedPublished = await b.unitOfWork.run((scope) => b.store.deletePendingSession(published.id, scope));
    const removedTentative = await b.unitOfWork.run((scope) => b.store.deletePendingSession(tentative.id, scope));

    expect(removedPublished).toBe(false);
    expect(removedTentative).toBe(true);
    expect(await a.store.countActiveSessions(1)).toBe(1);
    expect(await a.store.findPendingSession(tentative.id)).toBeNull();
  });

  it('runs post-commit effects once, only for the attempt that committed', async () => {
    const effects: string[] = [];
    await expect(
      a.unitOfWork.run(async (scope) => {
        await a.store.createPendingSession(draft(1), scope);
        scope.afterCommit(() => void effects.push('device command'));
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(effects).toEqual([]);

    await a.unitOfWork.run(async (scope) => {
      await a.store.createPendingSession(draft(1), scope);
      scope.afterCommit(() => void effects.push('device command'));
    });
    expect(effects).toEqual(['device command']);
  });

  it('keeps a session reserved by one instance invisible to the other until it is published', async () => {
    const reserved = await a.unitOfWork.run((scope) => a.store.createPendingSession(draft(1), scope));

    expect(await b.store.findActiveSessions(1)).toEqual([]);
    expect(await b.store.findOccupyingUserIds(1)).toEqual([1]);

    await a.unitOfWork.run((scope) => a.store.publishSession(reserved.id, scope));

    expect((await b.store.findActiveSessions(1)).map((session) => session.id)).toEqual([reserved.id]);
  });
});
