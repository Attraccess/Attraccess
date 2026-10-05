import { MigrationInterface, QueryRunner } from 'typeorm';

export class GenericMeters1790100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE resource_meter (
      id integer PRIMARY KEY AUTOINCREMENT, resourceId integer NOT NULL, name varchar NOT NULL,
      creditsPerUnit integer NOT NULL DEFAULT 0, lifetimeValue varchar NOT NULL DEFAULT '0',
      counterValue varchar, latestObservedAt datetime,
      FOREIGN KEY(resourceId) REFERENCES resource(id) ON DELETE CASCADE)`);
    await runner.query('CREATE UNIQUE INDEX IDX_resource_meter_name ON resource_meter(resourceId, name)');
    const resources: { resourceId: number }[] =
      await runner.query(`SELECT resourceId FROM resource_billing_configuration WHERE creditsPerKwh > 0
      UNION SELECT resourceId FROM resource_metering_session
      UNION SELECT resourceId FROM resource_flow_node WHERE type LIKE '%.resource.metering.%'`);
    for (const { resourceId } of resources) {
      await runner.query(
        `INSERT INTO resource_meter(resourceId, name, creditsPerUnit)
        VALUES (?, 'Energy (kWh)', COALESCE((SELECT creditsPerKwh FROM resource_billing_configuration WHERE resourceId = ?), 0))`,
        [resourceId, resourceId],
      );
      const [{ id }]: { id: number }[] = await runner.query('SELECT id FROM resource_meter WHERE resourceId = ?', [
        resourceId,
      ]);
      const sessions: {
        consumedMicroWh: string | null;
        latestMicroWh: string | null;
        baselineMicroWh: string | null;
        latestObservedAt: string | null;
      }[] = await runner.query(
        'SELECT * FROM resource_metering_session WHERE resourceId = ? ORDER BY createdAt, usageId',
        [resourceId],
      );
      const lifetime = sessions.reduce(
        (sum, s) => sum + BigInt(s.consumedMicroWh ?? s.latestMicroWh ?? '0'),
        BigInt(0),
      );
      const last = sessions.at(-1);
      const counter =
        last?.latestMicroWh == null
          ? (last?.baselineMicroWh ?? null)
          : (BigInt(last.latestMicroWh) + BigInt(last.baselineMicroWh ?? '0')).toString();
      await runner.query(
        'UPDATE resource_meter SET lifetimeValue = ?, counterValue = ?, latestObservedAt = ? WHERE id = ?',
        [lifetime.toString(), counter, last?.latestObservedAt ?? null, id],
      );
      const nodes: { id: string; type: string; data: string | null }[] = await runner.query(
        "SELECT id, type, data FROM resource_flow_node WHERE resourceId = ? AND type LIKE '%.resource.metering.%'",
        [resourceId],
      );
      for (const node of nodes) {
        const data = JSON.parse(node.data ?? '{}');
        data.meterId = id;
        // Missing legacy units were also rejected for reports and configured baselines.
        // Ready nodes without a baseline remain valid reset acknowledgements.
        if (
          Object.hasOwn(data, 'unit') ||
          Object.hasOwn(data, 'baselineUnit') ||
          node.type.endsWith('.report') ||
          (node.type.endsWith('.ready') && typeof data.baselineValue === 'string' && data.baselineValue.trim())
        )
          data.legacyEnergyUnit = data.unit ?? data.baselineUnit ?? '';
        delete data.unit;
        delete data.baselineUnit;
        if (node.type.endsWith('.report')) data.mode = 'total';
        await runner.query('UPDATE resource_flow_node SET data = ? WHERE id = ?', [JSON.stringify(data), node.id]);
      }
    }
    await runner.query(
      'ALTER TABLE resource_metering_session ADD meterId integer REFERENCES resource_meter(id) ON DELETE CASCADE',
    );
    await runner.query("ALTER TABLE resource_metering_session ADD collectionMode varchar NOT NULL DEFAULT 'requested'");
    await runner.query("ALTER TABLE resource_metering_session ADD meterName varchar NOT NULL DEFAULT 'Energy (kWh)'");
    await runner.query(
      'UPDATE resource_metering_session SET meterId = (SELECT id FROM resource_meter WHERE resource_meter.resourceId = resource_metering_session.resourceId)',
    );
    await runner.query('DROP INDEX IDX_resource_metering_session_usage');
    await runner.query(
      'CREATE UNIQUE INDEX IDX_resource_metering_session_usage ON resource_metering_session(usageId, meterId)',
    );
    for (const [before, after] of [
      ['creditsPerKwh', 'creditsPerUnit'],
      ['baselineMicroWh', 'baselineValue'],
      ['latestMicroWh', 'latestValue'],
      ['consumedMicroWh', 'consumedValue'],
    ]) {
      await runner.query(`ALTER TABLE resource_metering_session RENAME COLUMN ${before} TO ${after}`);
    }
    await runner.query(`CREATE TABLE generic_metering_operation (
      id varchar PRIMARY KEY NOT NULL, sessionId varchar, resourceId integer NOT NULL, meterId integer NOT NULL,
      kind varchar NOT NULL, status varchar NOT NULL, requestedAt datetime NOT NULL, completedAt datetime,
      totalValue varchar, observedAt datetime, source varchar, error text, createdAt datetime NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(sessionId) REFERENCES resource_metering_session(id) ON DELETE CASCADE,
      FOREIGN KEY(meterId) REFERENCES resource_meter(id) ON DELETE CASCADE)`);
    await runner.query(`INSERT INTO generic_metering_operation SELECT o.id, o.sessionId, o.resourceId, s.meterId,
      o.kind, o.status, o.requestedAt, o.completedAt, o.totalMicroWh, o.observedAt, o.source, o.error, o.createdAt
      FROM resource_metering_operation o JOIN resource_metering_session s ON s.id = o.sessionId`);
    await runner.query('DROP TABLE resource_metering_operation');
    await runner.query('ALTER TABLE generic_metering_operation RENAME TO resource_metering_operation');
    await runner.query(
      'CREATE INDEX IDX_resource_metering_operation_session ON resource_metering_operation(sessionId)',
    );
    await runner.query('ALTER TABLE resource_metering_operation ADD reportedValue varchar');
    await runner.query('ALTER TABLE resource_metering_operation ADD readingMode varchar');
    await runner.query('ALTER TABLE resource_usage ADD meterRates text');
    await runner.query('ALTER TABLE billing_transaction_item ADD meterQuantity varchar');
    await runner.query('ALTER TABLE billing_transaction_item ADD meterCreditsPerUnit integer');
    // Historical bills retain their original energy evidence and labels.
    await runner.query('UPDATE resource_billing_configuration SET creditsPerKwh = 0');
  }

  async down(runner: QueryRunner): Promise<void> {
    // Even an empty snapshot freezes a free usage's terms. The energy-only runtime
    // cannot preserve that evidence when the generic snapshot column is removed.
    const [{ snapshots }] = await runner.query(
      'SELECT COUNT(*) AS snapshots FROM resource_usage WHERE meterRates IS NOT NULL',
    );
    if (snapshots > 0)
      throw new Error(
        'Cannot revert generic meters without losing historical meter rate snapshots. Restore a pre-migration backup instead.',
      );
    const [{ count }] = await runner.query(`SELECT
      (SELECT COUNT(*) FROM resource_meter WHERE name <> 'Energy (kWh)') +
      (SELECT COUNT(*) FROM billing_transaction_item WHERE meterQuantity IS NOT NULL) +
      (SELECT COUNT(*) FROM resource_metering_operation WHERE sessionId IS NULL) AS count`);
    if (count > 0)
      throw new Error(
        'Cannot revert generic meters without losing new meter history. Restore a pre-migration backup instead.',
      );
    // Start baselines can collect idle consumption without a sessionless operation.
    // The old schema has no lifetime counter in which to retain that history.
    const meters: { id: number; lifetimeValue: string }[] = await runner.query(
      'SELECT id, lifetimeValue FROM resource_meter',
    );
    for (const meter of meters) {
      const sessions: { consumedValue: string | null; latestValue: string | null }[] = await runner.query(
        'SELECT consumedValue, latestValue FROM resource_metering_session WHERE meterId = ?',
        [meter.id],
      );
      const recorded = sessions.reduce(
        (sum, session) => sum + BigInt(session.consumedValue ?? session.latestValue ?? '0'),
        BigInt(0),
      );
      if (BigInt(meter.lifetimeValue) !== recorded)
        throw new Error(
          'Cannot revert generic meters without losing idle meter history. Restore a pre-migration backup instead.',
        );
    }
    const nodes: { id: string; type: string; data: string | null }[] = await runner.query(
      "SELECT id, type, data FROM resource_flow_node WHERE type LIKE '%.resource.metering.%'",
    );
    for (const node of nodes) {
      const data = JSON.parse(node.data ?? '{}');
      if ((data.value || data.baselineValue) && data.legacyEnergyUnit === undefined)
        throw new Error(
          'Cannot revert generic flow values to energy-only nodes. Restore a pre-migration backup instead.',
        );
      if (data.legacyEnergyUnit !== undefined)
        data[node.type.endsWith('.ready') ? 'baselineUnit' : 'unit'] = data.legacyEnergyUnit;
      delete data.legacyEnergyUnit;
      delete data.meterId;
      delete data.mode;
      await runner.query('UPDATE resource_flow_node SET data = ? WHERE id = ?', [JSON.stringify(data), node.id]);
    }
    await runner.query(
      'UPDATE resource_billing_configuration SET creditsPerKwh = COALESCE((SELECT creditsPerUnit FROM resource_meter WHERE resource_meter.resourceId = resource_billing_configuration.resourceId), 0)',
    );
    await runner.query(`CREATE TABLE legacy_metering_operation (
      id varchar PRIMARY KEY NOT NULL, sessionId varchar NOT NULL, resourceId integer NOT NULL,
      kind varchar NOT NULL, status varchar NOT NULL, requestedAt datetime NOT NULL, completedAt datetime,
      totalMicroWh varchar, observedAt datetime, source varchar, error text, createdAt datetime NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(sessionId) REFERENCES resource_metering_session(id) ON DELETE CASCADE)`);
    await runner.query(`INSERT INTO legacy_metering_operation SELECT id, sessionId, resourceId,
      kind, status, requestedAt, completedAt, totalValue, observedAt, source, error, createdAt FROM resource_metering_operation`);
    await runner.query('DROP TABLE resource_metering_operation');
    await runner.query('ALTER TABLE legacy_metering_operation RENAME TO resource_metering_operation');
    await runner.query(
      'CREATE INDEX IDX_resource_metering_operation_session ON resource_metering_operation(sessionId)',
    );
    await runner.query('DROP INDEX IDX_resource_metering_session_usage');
    await runner.query('CREATE UNIQUE INDEX IDX_resource_metering_session_usage ON resource_metering_session(usageId)');
    await runner.query('ALTER TABLE resource_metering_session DROP COLUMN meterId');
    await runner.query('ALTER TABLE resource_metering_session DROP COLUMN meterName');
    await runner.query('ALTER TABLE resource_metering_session DROP COLUMN collectionMode');
    for (const [before, after] of [
      ['creditsPerUnit', 'creditsPerKwh'],
      ['baselineValue', 'baselineMicroWh'],
      ['latestValue', 'latestMicroWh'],
      ['consumedValue', 'consumedMicroWh'],
    ])
      await runner.query(`ALTER TABLE resource_metering_session RENAME COLUMN ${before} TO ${after}`);
    await runner.query('ALTER TABLE resource_usage DROP COLUMN meterRates');
    await runner.query('ALTER TABLE billing_transaction_item DROP COLUMN meterQuantity');
    await runner.query('ALTER TABLE billing_transaction_item DROP COLUMN meterCreditsPerUnit');
    await runner.query('DROP TABLE resource_meter');
  }
}
