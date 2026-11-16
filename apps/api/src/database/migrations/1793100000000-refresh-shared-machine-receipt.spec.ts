import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { EmailTemplateType } from '@attraccess/application-models';
import { readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';
import { EmailTemplateTranslations1782500000000 } from './1782500000000-email-templates-locale';
import { RefreshSharedMachineReceipt1793100000000 } from './1793100000000-refresh-shared-machine-receipt';

it('refreshes the preceding stock receipt while preserving customized bodies, subjects, and variables', async () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const previous = readFileSync(join(__dirname, '__fixtures__', 'refreshed-meter-receipt-totals.mjml'), 'utf8');
  const source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = source.createQueryRunner();
  try {
    await new EmailTemplateTranslations1782500000000().up(runner);
    await runner.query(
      'CREATE TABLE email_templates(type varchar PRIMARY KEY, body text, subject text, variables text)',
    );
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?, ?)', [
      type,
      previous.replace(/\n/g, '\r\n'),
      'Custom subject',
      'items[].isUnavailable',
    ]);
    // An administrator's wording survives; a text deleted before this release is not brought back.
    await runner.query(
      'INSERT INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)',
      [type, 'shared_marker', 'de', 'Gemeinsam'],
    );
    const migration = new RefreshSharedMachineReceipt1793100000000();
    await migration.up(runner);
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      {
        body: readDefaultTemplateBody(type),
        subject: 'Custom subject',
        variables: expect.stringMatching(
          /^items\[\]\.isUnavailable,items\[\]\.isSharePending,items\[\]\.isShared,.*segments\[\]\.shareCredits$/,
        ),
      },
    ]);
    const translations: { key: string; value: string }[] = await runner.query(
      'SELECT "key", "value" FROM "email_template_translations" WHERE "locale" = ? ORDER BY "key"',
      ['de'],
    );
    expect(translations).toEqual(
      expect.arrayContaining([
        { key: 'shared_marker', value: 'Gemeinsam' },
        { key: 'quantity_pending', value: 'Ausstehend' },
        {
          key: 'meter_share_pending',
          value: SHIPPED_TRANSLATIONS.find((row) => row.templateType === type && row.key === 'meter_share_pending')
            ?.value,
        },
      ]),
    );
    expect(translations.map((row) => row.key)).not.toContain('meter_unavailable');

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
