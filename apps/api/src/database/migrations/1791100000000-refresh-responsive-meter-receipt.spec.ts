import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { RefreshResponsiveMeterReceipt1791100000000 } from './1791100000000-refresh-responsive-meter-receipt';

const previousBody = readFileSync(join(__dirname, '__fixtures__', 'energy-usage-receipt.mjml'), 'utf8')
  .trim()
  .replace("          {{else if this.isEnergy}}{{t 'item_energy' 'Energy'}}\n", '')
  .replace("          {{#if this.energyKwh}}<br/>{{t 'energy_amount' '{kwh} kWh' kwh=this.energyKwh}}{{/if}}\n", '');

describe('RefreshResponsiveMeterReceipt1791100000000', () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const migration = new RefreshResponsiveMeterReceipt1791100000000();
  let source: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE email_templates(type varchar PRIMARY KEY, body text, subject text)');
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it.each(['\n', '\r\n'])('refreshes stock receipts with %j line endings on upgraded installations', async (eol) => {
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?)', [
      type,
      previousBody.replace(/\n/g, eol),
      'Administrator subject',
    ]);

    await migration.up(runner);

    expect(await runner.query('SELECT body, subject FROM email_templates')).toEqual([
      { body: readDefaultTemplateBody(type), subject: 'Administrator subject' },
    ]);
  });

  it('preserves customized bodies on upgrade and downgrade', async () => {
    const customBody = previousBody.replace('Here is your receipt:', 'Your workshop receipt:');
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?)', [type, customBody, 'Custom subject']);

    await migration.up(runner);
    await migration.down();

    expect(await runner.query('SELECT body, subject FROM email_templates')).toEqual([
      { body: customBody, subject: 'Custom subject' },
    ]);
  });
});
