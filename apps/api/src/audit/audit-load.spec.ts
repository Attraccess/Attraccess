import { AuditLog, Resource, ResourceUsage } from '@attraccess/database-entities';
import { setTimeout as delay } from 'node:timers/promises';
import { LoadMachine, setupAuditLoadFixture } from './audit-load.test-fixture';
import { droppedRecords } from './audit.test-fixture';

const MACHINES = 6;
const CYCLES_PER_MACHINE = 10;
const ADMIN_EVENTS = 25;
/** Well below the 5 s busy timeout, so waiting writers must outlast it rather than give up. */
const HOLD_MS = 400;
/** The load normally finishes in about two seconds, but a full parallel test run can slow it several times over. */
const WORK_DEADLINE_MS = 30_000;

/**
 * Acceptance gate for ATT-1212: the real usage-session service (start, end and take-over, each writing its audit
 * row inside its resource-lifecycle transaction), administration changes recorded without a transaction, and an
 * unrelated long write transaction on the main connection run concurrently on one file-backed SQLite database.
 * Not a single audit record may be lost.
 */
describe('audit under concurrent load', () => {
  const fixture = setupAuditLoadFixture(MACHINES);

  it('loses no audit record while sessions, admin changes and a held transaction run concurrently', async () => {
    const { usage, audit, source } = fixture;
    let sessionCalls = 0;
    let adminCalls = 0;
    // Set when a machine fails or the load overruns its deadline: the other machines stop after their current
    // step, so nothing still writes while the fixture removes the database.
    let stopped = false;

    // Per machine: start/end cycles, one of them a take-over (the taker's start ends the owner's session).
    const runMachine = async ({ resourceId, owner, taker }: LoadMachine) => {
      try {
        for (let cycle = 0; cycle < CYCLES_PER_MACHINE && !stopped; cycle++) {
          sessionCalls++;
          await usage.startSession(resourceId, owner, {});
          if (stopped) return;
          if (cycle === CYCLES_PER_MACHINE / 2) {
            await usage.startSession(resourceId, taker, { forceTakeOver: true });
            await usage.endSession(resourceId, taker, {});
          } else {
            await usage.endSession(resourceId, owner, {});
          }
        }
      } catch (error) {
        stopped = true;
        throw error;
      }
    };

    // Controller path: no transaction. Spread out so changes arrive both during and after the held transaction.
    const runAdministration = async () => {
      const receipts = [];
      for (let index = 0; index < ADMIN_EVENTS; index++) {
        adminCalls++;
        receipts.push(
          audit.recordAdministration({
            action: 'mqtt_server.created',
            actorId: 1,
            authenticationMethod: 'session',
            subjectType: 'mqtt-server',
            subjectId: 1000 + index,
            details: { serverName: `Broker ${index}`, host: 'mqtt.example.test', port: 1883, useTls: 0 },
          }),
        );
        await delay(30);
      }
      return Promise.all(receipts);
    };

    // An unrelated request takes the main connection's write lock before anything else runs.
    const held = source.createQueryRunner();
    await held.startTransaction();
    await held.query('INSERT INTO project (id) VALUES (99)');

    const machines = Promise.allSettled(fixture.machines.map(runMachine));
    const deadline = setTimeout(() => (stopped = true), WORK_DEADLINE_MS);
    const administration = runAdministration();
    await delay(HOLD_MS);
    // The load is waiting on the lock: calls are in flight, yet nothing else has written.
    expect(sessionCalls).toBe(MACHINES);
    expect(adminCalls).toBeGreaterThan(0);
    expect(await held.query('SELECT count(*) AS n FROM audit_log')).toEqual([{ n: 0 }]);
    expect(await held.query('SELECT count(*) AS n FROM resource_usage')).toEqual([{ n: 0 }]);
    await held.commitTransaction();
    await held.release();

    // A main-connection deferred read-then-write (save of an existing row) while sessions keep running. It may
    // lose SQLite's deadlock check against a committing writer; that is the caller's error, never the audit's.
    const machine = await source.getRepository(Resource).findOneByOrFail({ id: 1 });
    const renamed = source
      .getRepository(Resource)
      .save({ ...machine, name: 'Renamed machine' })
      .then(
        () => 'saved',
        (error: { code?: string }) => error.code,
      );

    const [machineResults, receipts, renameOutcome] = await Promise.all([machines, administration, renamed]);
    clearTimeout(deadline);

    expect(await droppedRecords(fixture.metrics)).toEqual({});
    expect(machineResults.filter((result) => result.status === 'rejected')).toEqual([]);
    expect(stopped).toBe(false);
    expect(receipts.map((receipt) => receipt.status)).toEqual(Array(ADMIN_EVENTS).fill('recorded'));
    expect(['saved', 'SQLITE_BUSY']).toContain(renameOutcome);
    expect(await source.query('SELECT id FROM project WHERE id = 99')).toEqual([{ id: 99 }]);

    // Every cycle is one session, plus the taker's session on each machine; all of them ended.
    const sessions = await source.getRepository(ResourceUsage).find();
    const sessionCount = MACHINES * (CYCLES_PER_MACHINE + 1);
    expect(sessions).toHaveLength(sessionCount);
    expect(sessions.every((session) => session.endTime !== null && session.isFinalized)).toBe(true);

    const rows = await source.getRepository(AuditLog).find();
    const usageIds = (action: string) =>
      rows
        .filter((row) => row.action === action)
        .map((row) => Number(row.details.usageId))
        .sort((a, b) => a - b);
    const allUsageIds = sessions.map((session) => session.id).sort((a, b) => a - b);
    expect(rows).toHaveLength(2 * sessionCount + ADMIN_EVENTS);
    expect(usageIds('usage_session.started')).toEqual(allUsageIds);
    expect(usageIds('usage_session.ended')).toEqual(allUsageIds);
    expect(rows.filter((row) => row.domain === 'administration')).toHaveLength(ADMIN_EVENTS);
    // Passes in about a second. A regression fails slowly: every dropped write first waits the full busy timeout.
  }, 120_000);
});
