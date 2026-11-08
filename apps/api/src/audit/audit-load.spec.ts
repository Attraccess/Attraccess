import { AuditLog } from '@attraccess/database-entities';
import { closeResourceTransactionConnection, runSerializedTransaction } from '../database/run-serialized-transaction';
import { droppedRecords, setupAuditDatabase } from './audit.test-fixture';

const RESOURCES = 6;
const SESSION_CYCLES = 60;
const ADMIN_EVENTS = 25;

/**
 * Acceptance gate for ATT-1212: concurrent usage sessions, administration changes and an unrelated long
 * transaction on a file-backed SQLite database must not lose a single audit record.
 *
 * The session cycles run the same transactions as `usage-sessions.ts` start/end (a serialized resource-lifecycle
 * transaction that writes the session and its audit row), without the flow, metering and billing collaborators
 * that a full session needs a running Valkey for.
 */
describe('audit under concurrent load', () => {
  const fixture = setupAuditDatabase();

  afterEach(async () => {
    await closeResourceTransactionConnection(fixture.source);
  });

  it('loses no audit record while sessions, admin changes and a held transaction run concurrently', async () => {
    await fixture.source.query(
      'CREATE TABLE usage_session (id integer PRIMARY KEY AUTOINCREMENT, resourceId integer NOT NULL, endedAt text)',
    );
    await fixture.source.query('CREATE TABLE unrelated_change (id integer PRIMARY KEY)');
    const audit = fixture.service;

    const startSession = (resourceId: number) =>
      runSerializedTransaction(fixture.source.manager, async (manager) => {
        await manager.query('INSERT INTO usage_session (resourceId) VALUES (?)', [resourceId]);
        const [{ usageId }] = await manager.query('SELECT last_insert_rowid() AS usageId');
        await audit.recordResource(
          {
            action: 'usage_session.started',
            actorId: 42,
            subjectId: resourceId,
            details: { usageId, usageUserId: 42 },
          },
          manager,
        );
        return usageId;
      });

    const endSession = (resourceId: number, usageId: number) =>
      runSerializedTransaction(fixture.source.manager, async (manager) => {
        await manager.query("UPDATE usage_session SET endedAt = 'now' WHERE id = ?", [usageId]);
        await audit.recordResource(
          { action: 'usage_session.ended', actorId: 42, subjectId: resourceId, details: { usageId, usageUserId: 42 } },
          manager,
        );
      });

    const cycle = async (index: number) => {
      const resourceId = (index % RESOURCES) + 1;
      await endSession(resourceId, await startSession(resourceId));
    };

    const adminChange = (index: number) =>
      audit.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'mqtt-server',
        subjectId: 1000 + index,
        details: { serverName: `Broker ${index}`, host: 'mqtt.example.test', port: 1883, useTls: 0 },
      });

    // An unrelated request holds the main connection's write transaction for a while.
    const held = fixture.source.createQueryRunner();
    await held.startTransaction();
    await held.query('INSERT INTO unrelated_change VALUES (1)');
    const release = new Promise<void>((resolve) => setTimeout(resolve, 800)).then(async () => {
      await held.commitTransaction();
    });

    const adminReceipts = Array.from({ length: ADMIN_EVENTS }, (_, index) => adminChange(index));
    await Promise.all([
      release,
      ...Array.from({ length: SESSION_CYCLES }, (_, index) => cycle(index)),
      ...adminReceipts,
    ]);

    expect((await Promise.all(adminReceipts)).every((receipt) => receipt.status === 'recorded')).toBe(true);
    const rows = await fixture.source.getRepository(AuditLog).find();
    expect(rows).toHaveLength(SESSION_CYCLES * 2 + ADMIN_EVENTS);
    expect(rows.filter((row) => row.action === 'usage_session.started')).toHaveLength(SESSION_CYCLES);
    expect(rows.filter((row) => row.action === 'usage_session.ended')).toHaveLength(SESSION_CYCLES);
    expect(rows.filter((row) => row.domain === 'administration')).toHaveLength(ADMIN_EVENTS);
    expect(await fixture.source.query('SELECT count(*) AS n FROM usage_session WHERE endedAt IS NOT NULL')).toEqual([
      { n: SESSION_CYCLES },
    ]);
    expect(await droppedRecords(fixture.metrics)).toEqual({});
  }, 45_000);
});
