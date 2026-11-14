import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { RefreshSharedMachineReceipt1793000000000 } from './1793000000000-refresh-shared-machine-receipt';

it('refreshes the preceding stock receipt while preserving customized bodies, subjects, and variables', async () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const previous = readFileSync(join(__dirname, '__fixtures__', 'refreshed-meter-receipt-totals.mjml'), 'utf8');
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
    const migration = new RefreshSharedMachineReceipt1793000000000();
    await migration.up(runner);
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      {
        body: readDefaultTemplateBody(type),
        subject: 'Custom subject',
        variables: expect.stringMatching(/^items\[\]\.isUnavailable,items\[\]\.isShared,.*segments\[\]\.shareCredits$/),
      },
    ]);
    const custom = previous.replace('Here is your receipt:', 'Workshop receipt:');
    await runner.query('UPDATE email_templates SET body = ?', [custom]);
    await migration.up(runner);
    await migration.down();
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      { body: custom, subject: 'Custom subject', variables: expect.stringContaining('items[].isShared') },
    ]);
  } finally {
    await runner.release();
    await source.destroy();
  }
});
