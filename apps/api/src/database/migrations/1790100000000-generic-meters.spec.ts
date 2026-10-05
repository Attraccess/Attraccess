import { DataSource } from 'typeorm';
import { GenericMeters1790100000000 } from './1790100000000-generic-meters';

it('migrates energy definitions, readings and rates without changing historical bills', async () => {
  const source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.query('CREATE TABLE resource(id integer PRIMARY KEY)');
    await runner.query('CREATE TABLE resource_usage(id integer PRIMARY KEY)');
    await runner.query('CREATE TABLE resource_billing_configuration(resourceId integer, creditsPerKwh integer)');
    await runner.query(
      'CREATE TABLE resource_flow_node(id varchar PRIMARY KEY, resourceId integer, type varchar, data text)',
    );
    await runner.query(
      'CREATE TABLE billing_transaction_item(id integer PRIMARY KEY, unitPrice integer, energyMicroWh varchar, energyCreditsPerKwh integer)',
    );
    await runner.query(`CREATE TABLE resource_metering_session(id varchar PRIMARY KEY, resourceId integer, usageId integer, status varchar,
      creditsPerKwh integer, baselineMicroWh varchar, latestMicroWh varchar, consumedMicroWh varchar, latestObservedAt datetime, createdAt datetime)`);
    await runner.query('CREATE UNIQUE INDEX IDX_resource_metering_session_usage ON resource_metering_session(usageId)');
    await runner.query(`CREATE TABLE resource_metering_operation(id varchar, sessionId varchar, resourceId integer,
      kind varchar, status varchar, requestedAt datetime, completedAt datetime, totalMicroWh varchar, observedAt datetime, source varchar, error text, createdAt datetime)`);
    await runner.query('INSERT INTO resource VALUES (1)');
    await runner.query('INSERT INTO resource_usage VALUES (1), (2)');
    await runner.query('INSERT INTO resource_billing_configuration VALUES (1, 30)');
    await runner.query(
      `INSERT INTO resource_metering_session VALUES ('s', 1, 1, 'settled', 30, '1000000000000', '1500000000', '1500000000', datetime('now'), datetime('now'))`,
    );
    await runner.query(
      `INSERT INTO resource_metering_operation VALUES ('o', 's', 1, 'final', 'completed', datetime('now'), datetime('now'), '1500000000', datetime('now'), 'grid', null, datetime('now'))`,
    );
    await runner.query(`INSERT INTO billing_transaction_item VALUES (1, 45, '1500000000', 30)`);
    await runner.query('INSERT INTO resource_flow_node VALUES (?, ?, ?, ?)', [
      'report',
      1,
      'output.resource.metering.report',
      JSON.stringify({ value: '{{reading}}', unit: '{{unit}}' }),
    ]);
    const before = await runner.query('SELECT * FROM billing_transaction_item');
    await new GenericMeters1790100000000().up(runner);
    const [meter] = await runner.query('SELECT * FROM resource_meter');
    expect(meter).toEqual(
      expect.objectContaining({
        name: 'Energy (kWh)',
        creditsPerUnit: 30,
        lifetimeValue: '1500000000',
        counterValue: '1001500000000',
      }),
    );
    const [node] = await runner.query('SELECT data FROM resource_flow_node');
    expect(JSON.parse(node.data)).toEqual({
      value: '{{reading}}',
      legacyEnergyUnit: '{{unit}}',
      meterId: meter.id,
      mode: 'total',
    });
    expect(await runner.query('SELECT meterId, creditsPerUnit, consumedValue FROM resource_metering_session')).toEqual([
      { meterId: meter.id, creditsPerUnit: 30, consumedValue: '1500000000' },
    ]);
    expect(await runner.query('SELECT meterId, totalValue, reportedValue FROM resource_metering_operation')).toEqual([
      { meterId: meter.id, totalValue: '1500000000', reportedValue: null },
    ]);
    expect(
      await runner.query('SELECT id, unitPrice, energyMicroWh, energyCreditsPerKwh FROM billing_transaction_item'),
    ).toEqual(before);
    await runner.query("INSERT INTO resource_meter(resourceId, name) VALUES (1, 'Heartbeat')");
    // Multiple meters may now account for the same usage.
    await runner.query(
      "INSERT INTO resource_metering_session(id, resourceId, usageId, meterId, meterName, creditsPerUnit) VALUES ('s2', 1, 1, 2, 'Heartbeat', 2)",
    );
    await runner.query(
      "INSERT INTO resource_metering_operation(id, resourceId, meterId, kind, status, requestedAt) VALUES ('idle', 1, 2, 'interim', 'completed', datetime('now'))",
    );
    expect(await runner.query('PRAGMA foreign_key_check')).toEqual([]);
    await expect(new GenericMeters1790100000000().down(runner)).rejects.toThrow('losing new meter history');
    await runner.query("DELETE FROM resource_metering_operation WHERE id = 'idle'");
    await runner.query("DELETE FROM resource_metering_session WHERE id = 's2'");
    await runner.query('DELETE FROM resource_meter WHERE id = 2');
    await runner.query("UPDATE resource_meter SET lifetimeValue = '1500000001'");
    await expect(new GenericMeters1790100000000().down(runner)).rejects.toThrow('losing idle meter history');
    await runner.query("UPDATE resource_meter SET lifetimeValue = '1500000000'");
    await new GenericMeters1790100000000().down(runner);
    expect(await runner.query('SELECT creditsPerKwh FROM resource_billing_configuration')).toEqual([
      { creditsPerKwh: 30 },
    ]);
    expect(await runner.query('SELECT totalMicroWh FROM resource_metering_operation')).toEqual([
      { totalMicroWh: '1500000000' },
    ]);
    await new GenericMeters1790100000000().up(runner);
    expect(await runner.query('PRAGMA foreign_key_check')).toEqual([]);
  } finally {
    await runner.release();
    await source.destroy();
  }
});
