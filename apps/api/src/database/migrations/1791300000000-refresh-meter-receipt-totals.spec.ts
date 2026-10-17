import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { RefreshMeterReceiptTotals1791300000000 } from './1791300000000-refresh-meter-receipt-totals';

it('refreshes the preceding stock receipt while preserving customized bodies, subjects, and variables', async () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const previous = readFileSync(join(__dirname, '__fixtures__', 'meter-evidence-receipt.mjml'), 'utf8');
  const source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.query(
      'CREATE TABLE email_templates(type varchar PRIMARY KEY, body text, subject text, variables text)',
    );
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?, ?)', [
      type,
      previous.replace(/\n/g, '\r\n'),
      'Custom subject',
      'items[].isUnavailable',
    ]);
    const migration = new RefreshMeterReceiptTotals1791300000000();
    await migration.up(runner);
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      { body: readDefaultTemplateBody(type), subject: 'Custom subject', variables: 'items[].isUnavailable' },
    ]);
    const custom = previous.replace('Here is your receipt:', 'Workshop receipt:');
    await runner.query('UPDATE email_templates SET body = ?', [custom]);
    await migration.up(runner);
    await migration.down();
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      { body: custom, subject: 'Custom subject', variables: 'items[].isUnavailable' },
    ]);
  } finally {
    await runner.release();
    await source.destroy();
  }
});
