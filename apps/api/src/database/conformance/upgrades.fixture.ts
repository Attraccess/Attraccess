import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, MigrationExecutor } from 'typeorm';
import { SqliteBackend } from '../sqlite/backend';
import { SqlitePluginMigrations } from '../../plugin-system/persistence/typeorm-adapter';
import type { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
import type { LegacyVersion, UpgradeFixture } from './backend-fixture';

const AT = '2026-01-02 03:04:05.006';
const PLUGIN_MIGRATION = 'UpgradeFixture1700000000000';
const EXACT_READING = '900719925474099312345';

/** Constructed historical databases, not operator backups or evidence of another engine. */
export async function createSqliteUpgradeFixture(version: LegacyVersion): Promise<UpgradeFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-upgrade-'));
  const configuration = { type: 'sqlite' as const, database: join(directory, 'database.sqlite') };
  const connect = () => {
    const connection = new SqliteBackend(configuration).createConnection();
    connection.setOptions({ migrationsRun: false });
    return connection;
  };
  let source = connect();
  let interrupt = false;
  const plugin: LoadedPluginManifest = {
    name: 'upgrade-fixture',
    version: '1.0.0',
    main: { migrations: { directory: '.', entryPoint: 'plugin.cjs' } },
    attraccessVersion: {},
    permissions: [],
    pluginDirectory: directory,
    id: 'upgrade-fixture',
    status: 'loaded',
    error: null,
  };
  const pluginMigrations = new SqlitePluginMigrations(() => directory, configuration);
  const close = async () => {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await source.initialize();
    const all = [...source.migrations];
    if (version === 'before-usage-integrity') {
      // Ask the real executor for ordering: released exports include timestamp ties and older late exports.
      const ordered = await new MigrationExecutor(source).getPendingMigrations();
      const boundary = ordered.findIndex(({ name }) => name === 'ResourceUsageIntegrity1790100000000');
      if (boundary < 1) throw new Error('Released usage-integrity migration is missing');
      const prefix = ordered.slice(0, boundary).map(({ instance }) => {
        if (!instance) throw new Error('Released migration has no implementation');
        return instance;
      });
      source.migrations.splice(0, source.migrations.length, ...prefix);
    }
    await source.runMigrations({ transaction: 'all' });
    source.migrations.splice(0, source.migrations.length, ...all);
    await writeFile(
      join(directory, 'plugin.cjs'),
      `exports.${PLUGIN_MIGRATION} = class ${PLUGIN_MIGRATION} {
      async up(runner) { await runner.query('CREATE TABLE upgrade_fixture_data (id integer PRIMARY KEY, payload blob NOT NULL)'); }
      async down(runner) { await runner.query('DROP TABLE upgrade_fixture_data'); }
    };`,
    );
    await pluginMigrations.up(plugin);
    await seed(source, version);
    return {
      snapshot: () => snapshot(source),
      interruptNextUpgrade: () => {
        interrupt = true;
      },
      durationInMinutes: async () => {
        const [row]: { duration: number }[] = await source.query(
          'SELECT usageInMinutes AS duration FROM resource_usage WHERE id = 910',
        );
        return row.duration;
      },
      changeLedgerAmount: async (amount) => {
        await source.query('UPDATE billing_transaction SET amount = ? WHERE id = 911', [amount]);
        const [row]: { balance: string }[] = await source.query(
          'SELECT CAST(creditBalance AS TEXT) AS balance FROM user WHERE id = 901',
        );
        return row.balance;
      },
      tryRewriteAudit: async () => {
        await source.query("UPDATE audit_log SET action = 'rewritten' WHERE id = 913");
      },
      appliedMigrations: async () =>
        (await new MigrationExecutor(source).getExecutedMigrations()).map(({ name }) => name),
      integrityViolations: () => source.query('PRAGMA foreign_key_check'),
      upgrade: async () => {
        // Reopen from the production backend to exercise the current metadata and complete migration track.
        await source.destroy();
        source = connect();
        await source.initialize();
        const pending = await new MigrationExecutor(source).getPendingMigrations();
        const first = pending[0]?.instance;
        const originalUp = first?.up;
        if (interrupt && first && originalUp) {
          interrupt = false;
          first.up = async (runner) => {
            await originalUp.call(first, runner);
            throw new Error('fixture interrupted after released migration writes');
          };
        }
        let executed;
        try {
          executed = await source.runMigrations({ transaction: 'all' });
        } finally {
          if (first && originalUp) first.up = originalUp;
        }
        await pluginMigrations.up(plugin);
        return executed.map(({ name }) => name);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function seed(source: DataSource, version: LegacyVersion): Promise<void> {
  const statements: [string, unknown[]][] = [
    [
      'INSERT INTO user (id, username, email, isEmailVerified) VALUES (901, ?, ?, 1)',
      ['legacy.user', 'legacy@example.test'],
    ],
    [
      "INSERT INTO authentication_detail (id, userId, type, password) VALUES (902, 901, 'local_password', ?)",
      ['retained:$hash:with:bytes'],
    ],
    [
      'INSERT INTO role (id, key, name, description) VALUES (903, ?, ?, ?)',
      ['legacy-role', 'Legacy Role', 'Retained access'],
    ],
    ["INSERT INTO user_role (id, userId, roleId, source) VALUES (904, 901, 903, 'manual')", []],
    ['INSERT INTO resource (id, name, type) VALUES (905, ?, ?)', ['Legacy Machine', 'machine']],
    [
      'INSERT INTO resource_introduction (id, resourceId, receiverUserId, tutorUserId, completedAt) VALUES (906, 905, 901, 901, ?)',
      [AT],
    ],
    ["INSERT INTO resource_introducer (id, resourceId, userId, type) VALUES (907, 905, 901, 'introducer')", []],
    [
      'INSERT INTO session (id, userId, token, expiresAt, createdAt, lastAccessedAt) VALUES (908, 901, ?, ?, ?, ?)',
      ['retained-session-hash', '2099-01-02 03:04:05.006', AT, AT],
    ],
    [
      'INSERT INTO passkey (id, userId, credentialId, publicKey, counter, name) VALUES (909, 901, ?, ?, 42, ?)',
      ['AAECA_8', 'retained-COSE-key', 'Legacy Key'],
    ],
    [
      "INSERT INTO resource_usage (id, resourceId, userId, usageAction, startTime, endTime, isFinalized) VALUES (910, 905, 901, 'usage', ?, ?, 1)",
      [AT, '2026-01-02 03:14:05.006'],
    ],
    [
      "INSERT INTO billing_transaction (id, userId, amount, status, externalReference) VALUES (911, 901, 123456789, 'completed', 'legacy-credit')",
      [],
    ],
    [
      'INSERT INTO resource_operating_interval (id, resourceId, startTime, endTime, startFlowNodeId, startFlowRunId) VALUES (912, 905, ?, ?, ?, ?)',
      [AT, '2026-01-02 03:14:05.006', 'deleted-node', 'retained-run'],
    ],
    [
      "INSERT INTO audit_log (id, at, domain, action, operationId, actorId, outcome, subjectType, subjectId, details) VALUES (913, ?, 'resources', 'updated', 'retained-operation', 901, 'succeeded', 'resource', 905, ?)",
      [AT, '{"name":"Legacy Machine","present":true}'],
    ],
    ['INSERT INTO upgrade_fixture_data (id, payload) VALUES (914, ?)', [Buffer.from([0, 255, 1, 128, 0])]],
  ];
  for (const [sql, parameters] of statements) await source.query(sql, parameters);
  if (version === 'before-usage-integrity') {
    await source.query(
      `INSERT INTO resource_metering_session
      (id, resourceId, usageId, status, creditsPerKwh, baselineMicroWh, latestMicroWh, consumedMicroWh, latestObservedAt)
      VALUES ('retained-meter-session', 905, 910, 'settled', 7, '10', ?, ?, ?)`,
      [EXACT_READING, EXACT_READING, AT],
    );
  } else {
    await source.query(
      "INSERT INTO resource_meter (id, resourceId, name, lifetimeValue) VALUES (915, 905, 'Energy (kWh)', ?)",
      [EXACT_READING],
    );
    await source.query(
      `INSERT INTO resource_metering_session
      (id, resourceId, usageId, meterId, status, creditsPerUnit, baselineValue, latestValue, consumedValue, latestObservedAt)
      VALUES ('retained-meter-session', 905, 910, 915, 'settled', 7, '10', ?, ?, ?)`,
      [EXACT_READING, EXACT_READING, AT],
    );
  }
}

async function snapshot(source: DataSource): Promise<Record<string, unknown[]>> {
  const generic =
    (await source.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resource_meter'")).length > 0;
  const selections = {
    identity:
      'SELECT id, username, email, isEmailVerified, CAST(creditBalance AS TEXT) AS balance FROM user WHERE id = 901',
    credentials: 'SELECT id, userId, type, password FROM authentication_detail WHERE id = 902',
    role: 'SELECT id, key, name, description FROM role WHERE id = 903',
    grants: 'SELECT id, userId, roleId, source FROM user_role WHERE id = 904',
    introductions:
      'SELECT id, resourceId, receiverUserId, tutorUserId, completedAt FROM resource_introduction WHERE id = 906',
    introducers: 'SELECT id, resourceId, userId, type FROM resource_introducer WHERE id = 907',
    sessions: 'SELECT id, userId, token, expiresAt, createdAt, lastAccessedAt FROM session WHERE id = 908',
    passkeys: 'SELECT id, userId, credentialId, publicKey, counter, name FROM passkey WHERE id = 909',
    usages:
      'SELECT id, resourceId, userId, usageAction, startTime, endTime, isFinalized FROM resource_usage WHERE id = 910',
    ledger:
      'SELECT id, userId, CAST(amount AS TEXT) AS amount, status, externalReference FROM billing_transaction WHERE id = 911',
    intervals:
      'SELECT id, resourceId, startTime, endTime, startFlowNodeId, startFlowRunId FROM resource_operating_interval WHERE id = 912',
    audit: 'SELECT * FROM audit_log WHERE id = 913',
    pluginData: 'SELECT id, hex(payload) AS bytes FROM upgrade_fixture_data ORDER BY id',
    pluginHistory: 'SELECT timestamp, name FROM plugin_migrations_upgrade_fixture ORDER BY id',
    meter: `SELECT id, resourceId, usageId, status, ${generic ? 'creditsPerUnit' : 'creditsPerKwh'} AS rate,
      ${generic ? 'baselineValue' : 'baselineMicroWh'} AS baseline, ${generic ? 'latestValue' : 'latestMicroWh'} AS latest,
      ${generic ? 'consumedValue' : 'consumedMicroWh'} AS consumed, latestObservedAt FROM resource_metering_session ORDER BY id`,
  };
  const result: Record<string, unknown[]> = {};
  for (const [name, query] of Object.entries(selections)) result[name] = await source.query(query);
  return result;
}
