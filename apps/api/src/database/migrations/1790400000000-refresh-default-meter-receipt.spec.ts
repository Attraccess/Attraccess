import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import * as emailDefaults from '../../email-template/email-defaults';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { RefreshDefaultMeterReceipt1790400000000 } from './1790400000000-refresh-default-meter-receipt';

// Freeze the prior stock body independently of later edits to the default asset.
const energyBody = readFileSync(join(__dirname, '__fixtures__', 'energy-usage-receipt.mjml'), 'utf8').trim();
const genericBody = energyBody
  .replace("          {{else if this.isEnergy}}{{t 'item_energy' 'Energy'}}\n", '')
  .replace("          {{#if this.energyKwh}}<br/>{{t 'energy_amount' '{kwh} kWh' kwh=this.energyKwh}}{{/if}}\n", '');

describe('RefreshDefaultMeterReceipt1790400000000', () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const migration = new RefreshDefaultMeterReceipt1790400000000();
  let source: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE email_templates(type varchar PRIMARY KEY, body text, subject text)');
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?)', [type, energyBody, 'Custom subject']);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await runner.release();
    await source.destroy();
  });

  it.each([energyBody, genericBody])(
    'refreshes either previous stock receipt on already-upgraded databases',
    async (body) => {
      await runner.query('UPDATE email_templates SET body = ?', [body]);

      await migration.up(runner);

      expect(await runner.query('SELECT body, subject FROM email_templates')).toEqual([
        { body: readDefaultTemplateBody(type), subject: 'Custom subject' },
      ]);
    },
  );

  it('refreshes the first generic receipt when the shipped default is revised later', async () => {
    await runner.query('UPDATE email_templates SET body = ?', [genericBody]);
    const revisedBody = genericBody.replace('Here is your receipt:', 'Here are your meter charges:');
    jest.spyOn(emailDefaults, 'readDefaultTemplateBody').mockReturnValue(revisedBody);

    await migration.up(runner);

    expect(await runner.query('SELECT body FROM email_templates')).toEqual([{ body: revisedBody }]);
  });

  it.each(['\r\n', '\r'])(
    'recognizes shipped content with %j line endings and outer whitespace',
    async (lineEnding) => {
      await runner.query('UPDATE email_templates SET body = ?', [`\n${energyBody.replace(/\n/g, lineEnding)}\n`]);

      await migration.up(runner);

      expect(await runner.query('SELECT body FROM email_templates')).toEqual([{ body: readDefaultTemplateBody(type) }]);
    },
  );

  it('preserves customized receipts and unrelated templates', async () => {
    const customBody = energyBody.replace('Here is your receipt:', 'A custom receipt:');
    await runner.query('UPDATE email_templates SET body = ?', [customBody]);
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?)', [
      EmailTemplateType.VERIFY_EMAIL,
      energyBody,
      'Verify',
    ]);
    const before = await runner.query('SELECT * FROM email_templates');

    await migration.up(runner);

    expect(await runner.query('SELECT * FROM email_templates')).toEqual(before);
  });

  it('preserves an administrator edit made between reading and updating', async () => {
    const customBody = '<mj-text>Concurrent edit</mj-text>';
    const query = runner.query.bind(runner);
    jest.spyOn(runner, 'query').mockImplementationOnce(async (sql, parameters) => {
      const rows = await query(sql, parameters);
      await query('UPDATE email_templates SET body = ?', [customBody]);
      return rows;
    });

    await migration.up(runner);

    expect(await runner.query('SELECT body FROM email_templates')).toEqual([{ body: customBody }]);
  });

  it('does not rewrite current content or undo administrator changes on downgrade', async () => {
    await migration.up(runner);
    const changes = await runner.query('SELECT total_changes() AS changes');

    await migration.up(runner);
    expect(await runner.query('SELECT total_changes() AS changes')).toEqual(changes);
    await runner.query('UPDATE email_templates SET body = ?', ['<mj-text>Edited current receipt</mj-text>']);
    await migration.down();

    expect(await runner.query('SELECT body FROM email_templates')).toEqual([
      { body: '<mj-text>Edited current receipt</mj-text>' },
    ]);
  });

  it('does nothing when the receipt is absent', async () => {
    await runner.query('DELETE FROM email_templates');

    await migration.up(runner);

    expect(await runner.query('SELECT * FROM email_templates')).toEqual([]);
  });
});
