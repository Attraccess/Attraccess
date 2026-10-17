import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, QueryRunner } from 'typeorm';
import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { readDefaultTemplateBody } from '../../email-template/email-defaults';
import { EmailTemplateService } from '../../email-template/email-template.service';
import { MjmlService } from '../../email-template/mjml.service';
import { EmailTemplateTranslations1782500000000 } from './1782500000000-email-templates-locale';
import { RefreshMeterEvidenceReceipt1791200000000 } from './1791200000000-refresh-meter-evidence-receipt';

describe('RefreshMeterEvidenceReceipt1791200000000', () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const previous = readFileSync(join(__dirname, '__fixtures__', 'responsive-meter-receipt.mjml'), 'utf8');
  const migration = new RefreshMeterEvidenceReceipt1791200000000();
  let source: DataSource;
  let runner: QueryRunner;
  let service: EmailTemplateService;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [EmailTemplateTranslation],
    }).initialize();
    runner = source.createQueryRunner();
    await new EmailTemplateTranslations1782500000000().up(runner);
    service = new EmailTemplateService(
      source.getRepository(EmailTemplate),
      source.getRepository(EmailTemplateTranslation),
      new MjmlService(),
    );
    await runner.query(
      'CREATE TABLE email_templates(type varchar PRIMARY KEY, body text, subject text, variables text)',
    );
    await runner.query('INSERT INTO email_templates VALUES (?, ?, ?, ?)', [
      type,
      previous.replace(/\n/g, '\r\n'),
      'Custom subject',
      'items[].quantity',
    ]);
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('refreshes the previous stock receipt and variables while preserving customized bodies and subjects', async () => {
    await migration.up(runner);
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      {
        body: readDefaultTemplateBody(type),
        subject: 'Custom subject',
        variables: 'items[].quantity,items[].isUnavailable',
      },
    ]);
    const custom = previous.replace('Here is your receipt:', 'Workshop receipt:');
    await runner.query('UPDATE email_templates SET body = ?, variables = ?', [custom, 'custom.variable']);
    await migration.up(runner);
    await migration.down();
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      { body: custom, subject: 'Custom subject', variables: 'custom.variable' },
    ]);
  });

  it.each(['de', 'de-DE'])('makes unavailable meter evidence available in %s after upgrading', async (locale) => {
    // Existing installations already ran the earlier translation-seeding migrations.
    await runner.query('INSERT INTO email_template_translations VALUES (?, ?, ?, ?)', [
      type,
      'greeting',
      'de',
      'Hallo {name},',
    ]);

    await migration.up(runner);

    expect(await service.getTranslationsMap(type, locale)).toMatchObject({
      meter_unavailable: 'Endwert nicht verfügbar; keine Zählergebühr enthalten.',
      quantity_unavailable: 'Nicht verfügbar',
    });
  });

  it('seeds missing translations for a custom receipt without replacing administrator overrides', async () => {
    const custom = previous.replace('Here is your receipt:', 'Workshop receipt:');
    await runner.query('UPDATE email_templates SET body = ?, variables = ?', [custom, 'custom.variable']);
    await runner.query('INSERT INTO email_template_translations VALUES (?, ?, ?, ?), (?, ?, ?, ?)', [
      type,
      'meter_unavailable',
      'de',
      'Eigener Hinweis zum fehlenden Endwert',
      type,
      'quantity_unavailable',
      'de-CH',
      'Keine Messung',
    ]);

    await migration.up(runner);

    expect(await service.getTranslationsMap(type, 'de')).toMatchObject({
      meter_unavailable: 'Eigener Hinweis zum fehlenden Endwert',
      quantity_unavailable: 'Nicht verfügbar',
    });
    expect(await service.getTranslationsMap(type, 'de-CH')).toMatchObject({
      meter_unavailable: 'Eigener Hinweis zum fehlenden Endwert',
      quantity_unavailable: 'Keine Messung',
    });
    const translations = await runner.query('SELECT * FROM email_template_translations');
    const changes = await runner.query('SELECT total_changes() AS changes');

    await migration.up(runner);
    await migration.down();

    expect(await runner.query('SELECT * FROM email_template_translations')).toEqual(translations);
    expect(await runner.query('SELECT total_changes() AS changes')).toEqual(changes);
    expect(await runner.query('SELECT body, subject, variables FROM email_templates')).toEqual([
      { body: custom, subject: 'Custom subject', variables: 'custom.variable' },
    ]);
  });

  it('does not seed receipt translations when the template is absent', async () => {
    await runner.query('DELETE FROM email_templates');

    await migration.up(runner);

    expect(await runner.query('SELECT * FROM email_template_translations')).toEqual([]);
  });
});
