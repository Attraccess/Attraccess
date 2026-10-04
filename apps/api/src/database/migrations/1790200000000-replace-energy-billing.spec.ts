import { DataSource, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { GenericMeters1790100000000 } from './1790100000000-generic-meters';
import { ReplaceEnergyBilling1790200000000 } from './1790200000000-replace-energy-billing';
import { MeterFlowConversions1790300000000 } from './1790300000000-meter-flow-conversions';
import { compileFlowTemplate } from '../../resources/flows/flow-template';

describe('energy billing replacement', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE resource(id integer PRIMARY KEY)');
    await runner.query(`CREATE TABLE resource_usage(id integer PRIMARY KEY, resourceId integer,
      energyCreditsPerKwh integer, startTime datetime, endTime datetime,
      usageInMinutes integer GENERATED ALWAYS AS ((julianday(endTime) - julianday(startTime)) * 1440) STORED)`);
    await runner.query('CREATE INDEX usage_resource ON resource_usage(resourceId)');
    await runner.query('CREATE TABLE resource_billing_configuration(resourceId integer, creditsPerKwh integer)');
    await runner.query(
      'CREATE TABLE resource_flow_node(id varchar PRIMARY KEY, resourceId integer, type varchar, data text)',
    );
    await runner.query(`CREATE TABLE resource_metering_session(id varchar PRIMARY KEY, resourceId integer, usageId integer,
      status varchar, creditsPerKwh integer, baselineMicroWh varchar, latestMicroWh varchar, consumedMicroWh varchar,
      latestObservedAt datetime, createdAt datetime, FOREIGN KEY(usageId) REFERENCES resource_usage(id) ON DELETE CASCADE)`);
    await runner.query('CREATE UNIQUE INDEX IDX_resource_metering_session_usage ON resource_metering_session(usageId)');
    await runner.query(`CREATE TABLE resource_metering_operation(id varchar PRIMARY KEY, sessionId varchar, resourceId integer,
      kind varchar, status varchar, requestedAt datetime, completedAt datetime, totalMicroWh varchar,
      observedAt datetime, source varchar, error text, createdAt datetime)`);
    await runner.query(
      'CREATE TABLE billing_transaction(id integer PRIMARY KEY, resourceUsageId integer, amount integer, status varchar)',
    );
    await runner.query(`CREATE TABLE billing_transaction_item(id integer PRIMARY KEY, billingTransactionId integer,
      name varchar, description varchar, externalReference varchar, unitPrice integer, quantity integer,
      energyMicroWh varchar, energyCreditsPerKwh integer,
      FOREIGN KEY(billingTransactionId) REFERENCES billing_transaction(id) ON DELETE CASCADE)`);
    await runner.query('CREATE TABLE email_templates(type varchar PRIMARY KEY, body text)');
    await runner.query('CREATE TABLE item_updates(id integer)');
    await runner.query(
      'CREATE TRIGGER item_audit AFTER UPDATE ON billing_transaction_item BEGIN INSERT INTO item_updates VALUES (NEW.id); END',
    );
    await runner.query('INSERT INTO resource VALUES (1), (2), (3)');
    await runner.query(
      'INSERT INTO resource_usage(id, resourceId, energyCreditsPerKwh) VALUES (1, 1, 15), (2, 1, 25), (3, 2, 10), (4, 3, 0)',
    );
    await runner.query('INSERT INTO resource_billing_configuration VALUES (1, 30), (2, 0), (3, 0)');
    await runner.query(`INSERT INTO resource_metering_session VALUES
      ('settled', 1, 1, 'settled', 15, '1000000000000', '1500000000', '1500000000', '2026-10-01', '2026-10-01'),
      ('active', 1, 2, 'active', 25, '2000000000000', NULL, NULL, NULL, '2026-10-02')`);
    await runner.query(`INSERT INTO resource_metering_operation VALUES
      ('final', 'settled', 1, 'final', 'completed', '2026-10-01', '2026-10-01', '1500000000', '2026-10-01', 'grid', NULL, '2026-10-01')`);
    await runner.query("INSERT INTO billing_transaction VALUES (1, 1, -23, 'completed')");
    await runner.query(`INSERT INTO billing_transaction_item VALUES
      (1, 1, 'ENERGY', 'Original description', 'metering:settled:final', 23, 1, '1500000000', 15),
      (2, 1, 'ENERGY', NULL, 'huge-reading', 1, 1, '100000000000000000000009', 1),
      (3, 1, 'Setup', NULL, NULL, 100, 1, NULL, NULL)`);
    await runner.query('INSERT INTO resource_flow_node VALUES (?, 1, ?, ?)', [
      'report',
      'output.resource.metering.report',
      JSON.stringify({ value: '{{reading}}', unit: '{{unit}}' }),
    ]);
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('migrates all evidence, removes the old schema, and preserves bills, constraints and generated usage columns', async () => {
    const bills = await runner.query('SELECT * FROM billing_transaction');
    const amounts = await runner.query(
      'SELECT id, description, externalReference, unitPrice, quantity FROM billing_transaction_item',
    );
    await new GenericMeters1790100000000().up(runner);
    // Simulate a database already upgraded by the earlier version of this branch.
    await runner.query('UPDATE resource_meter SET counterValue = NULL');
    await runner.query("INSERT INTO resource_meter(resourceId, name, creditsPerUnit) VALUES (3, 'Heartbeats', 50)");
    await runner.query("INSERT INTO resource_meter(resourceId, name) VALUES (2, 'Water')");
    await runner.query('INSERT INTO resource_usage(id, resourceId, meterRates) VALUES (5, 2, ?)', [
      JSON.stringify([{ meterId: 3, name: 'Water', creditsPerUnit: 0 }]),
    ]);
    await runner.query(`INSERT INTO resource_metering_session(id, resourceId, usageId, meterId, meterName,
      creditsPerUnit, status, collectionMode, createdAt) VALUES ('water', 2, 5, 3, 'Water', 0, 'active', 'increment', '2026-10-03')`);
    await runner.query('UPDATE resource_usage SET meterRates = ? WHERE id = 4', [
      JSON.stringify([{ meterId: 2, name: 'Heartbeats', creditsPerUnit: 5 }]),
    ]);
    await new ReplaceEnergyBilling1790200000000().up(runner);
    const [meter] = await runner.query('SELECT * FROM resource_meter WHERE resourceId = 1');
    expect(meter).toMatchObject({ creditsPerUnit: 30, counterValue: '2000000000000', lifetimeValue: '1500000000' });
    const snapshots = await runner.query('SELECT id, meterRates FROM resource_usage ORDER BY id');
    expect(JSON.parse(snapshots[0].meterRates)).toEqual([
      { meterId: meter.id, name: 'Energy (kWh)', creditsPerUnit: 15 },
    ]);
    expect(JSON.parse(snapshots[1].meterRates)).toEqual([
      { meterId: meter.id, name: 'Energy (kWh)', creditsPerUnit: 25 },
    ]);
    expect(JSON.parse(snapshots[2].meterRates)).toEqual([
      expect.objectContaining({ name: 'Energy (kWh)', creditsPerUnit: 10 }),
    ]);
    // A later generic session cannot absorb an earlier energy price snapshot.
    expect(JSON.parse(snapshots[2].meterRates)[0].meterId).not.toBe(3);
    expect(await runner.query('SELECT counterValue FROM resource_meter WHERE id = 3')).toEqual([
      { counterValue: null },
    ]);
    expect(JSON.parse(snapshots[3].meterRates)).toEqual([{ meterId: 2, name: 'Heartbeats', creditsPerUnit: 5 }]);
    expect(
      await runner.query('SELECT id, name, meterQuantity, meterCreditsPerUnit FROM billing_transaction_item'),
    ).toEqual([
      { id: 1, name: 'Energy (kWh)', meterQuantity: '1.5', meterCreditsPerUnit: 15 },
      { id: 2, name: 'Energy (kWh)', meterQuantity: '100000000000000.000000009', meterCreditsPerUnit: 1 },
      { id: 3, name: 'Setup', meterQuantity: null, meterCreditsPerUnit: null },
    ]);
    expect(await runner.query('SELECT * FROM billing_transaction')).toEqual(bills);
    expect(
      await runner.query(
        'SELECT id, description, externalReference, unitPrice, quantity FROM billing_transaction_item',
      ),
    ).toEqual(amounts);
    for (const table of [
      'resource_usage',
      'resource_billing_configuration',
      'billing_transaction_item',
      'resource_metering_session',
      'resource_metering_operation',
    ]) {
      const columns: { name: string }[] = await runner.query(`PRAGMA table_xinfo(${table})`);
      expect(columns.map((c) => c.name)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/energy|microWh|creditsPerKwh/i)]),
      );
    }
    expect(await runner.query('SELECT totalValue FROM resource_metering_operation')).toEqual([
      { totalValue: '1500000000' },
    ]);
    await runner.query(
      "UPDATE resource_usage SET startTime = '2026-10-01 00:00:00', endTime = '2026-10-01 01:00:00' WHERE id = 1",
    );
    const [usage] = await runner.query('SELECT usageInMinutes FROM resource_usage WHERE id = 1');
    expect(usage.usageInMinutes).toBeCloseTo(60, 5);
    expect(
      await runner.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'usage_resource'"),
    ).toHaveLength(1);
    expect(await runner.query('SELECT * FROM item_updates')).toHaveLength(2);
    expect(await runner.query('PRAGMA foreign_key_check')).toEqual([]);
    await runner.query('DELETE FROM resource_usage WHERE id = 1');
    expect(await runner.query('SELECT * FROM resource_metering_operation')).toEqual([]);
    await new ReplaceEnergyBilling1790200000000().down(runner);
    // Earlier generic versions still understand the converted evidence. Energy-only rollback must refuse it.
    expect(await runner.query('SELECT meterQuantity FROM billing_transaction_item WHERE id = 1')).toEqual([
      { meterQuantity: '1.5' },
    ]);
    await expect(new GenericMeters1790100000000().down(runner)).rejects.toThrow('pre-migration backup');
  });

  it('freezes empty snapshots and preserves administrator receipt edits', async () => {
    await new GenericMeters1790100000000().up(runner);
    await runner.query("INSERT INTO resource_meter(resourceId, name, creditsPerUnit) VALUES (3, 'Now billed', 50)");
    await runner.query('INSERT INTO email_templates VALUES (?, ?)', [
      EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
      '<mj-text>Custom receipt</mj-text>',
    ]);
    await new ReplaceEnergyBilling1790200000000().up(runner);
    expect(await runner.query('SELECT meterRates FROM resource_usage WHERE id = 4')).toEqual([{ meterRates: '[]' }]);
    expect(await runner.query('SELECT body FROM email_templates')).toEqual([
      { body: '<mj-text>Custom receipt</mj-text>' },
    ]);
  });

  it('updates the previous shipped energy receipt to the generic receipt', async () => {
    await new GenericMeters1790100000000().up(runner);
    const current = readDefaultTemplateBody(EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY);
    const previous = readFileSync(join(__dirname, '__fixtures__', 'energy-usage-receipt.mjml'), 'utf8').trim();
    await runner.query('INSERT INTO email_templates VALUES (?, ?)', [
      EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
      previous,
    ]);
    await new ReplaceEnergyBilling1790200000000().up(runner);
    expect(await runner.query('SELECT body FROM email_templates')).toEqual([{ body: current }]);
  });

  it.each([
    ['report', 'value', 'unit'],
    ['ready', 'baselineValue', 'baselineUnit'],
  ])(
    'preserves rejection of an explicitly empty %s unit through all meter migrations',
    async (kind, valueField, unitField) => {
      await runner.query('DELETE FROM resource_flow_node');
      await runner.query('INSERT INTO resource_flow_node VALUES (?, 1, ?, ?)', [
        kind,
        `output.resource.metering.${kind}`,
        JSON.stringify({ [valueField]: '{{reading}}', [unitField]: '' }),
      ]);
      await new GenericMeters1790100000000().up(runner);
      await new ReplaceEnergyBilling1790200000000().up(runner);
      await new MeterFlowConversions1790300000000().up(runner);

      const [node] = await runner.query('SELECT data FROM resource_flow_node');
      const data = JSON.parse(node.data);
      expect(data).not.toHaveProperty('unit');
      expect(data).not.toHaveProperty('baselineUnit');
      expect(data).not.toHaveProperty('legacyEnergyUnit');
      expect(() => compileFlowTemplate(data[valueField], { reading: '1500' })).toThrow('no mapping');
    },
  );
});
