import { DataSource, QueryRunner } from 'typeorm';
import { EmailTemplateType } from '@attraccess/database-entities';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../../email-template/email-defaults';
import { EmailTemplates1748886859854 } from './1748886859854-email-templates';
import { EmailTemplateVariables1748888690640 } from './1748888690640-email-template-variables';
import { EmailTemplatesAddBillingSummary1759800000000 } from './1760018355010-email-templates-add-resource-usage-billing-summary';
import { EmailTemplateTranslations1782500000000 } from './1782500000000-email-templates-locale';
import { RefreshDefaultUsageReceipt1789900001000 } from './1789900001000-refresh-default-usage-receipt';

// Frozen shipped body: migration coverage must not follow later asset edits.
const originalBody = `<mj-section background-color="#FFFFFF" padding="32px 20px 8px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 8px 0">
      {{t 'body' 'Your session on <strong>{resource}</strong> has ended. Here is your receipt:' resource=resource.name}}
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 4px 0">
      {{t 'start_label' 'Start: {time}' time=usage.startTime}}<br/>
      {{t 'end_label' 'End: {time}' time=usage.endTime}}<br/>
      {{t 'duration_label' 'Duration: {minutes} min' minutes=usage.roundedMinutes}}
    </mj-text>
  </mj-column>
</mj-section>
<mj-section background-color="#FFFFFF" padding="0 20px 24px 20px">
  <mj-column>
    <mj-table>
      <tr><th align="left">{{t 'col_item' 'Item'}}</th><th align="right">{{t 'col_qty' 'Qty'}}</th><th align="right">{{t 'col_unit' 'Unit'}}</th><th align="right">{{t 'col_total' 'Total'}}</th></tr>
      {{#each items}}
      <tr>
        <td>{{this.name}}</td>
        <td align="right">{{this.quantity}}</td>
        <td align="right">{{this.unitPrice}}</td>
        <td align="right">{{this.total}}</td>
      </tr>
      {{/each}}
      <tr>
        <td colspan="3" align="right"><strong>{{t 'total_credits' 'Total Credits'}}</strong></td>
        <td align="right"><strong>{{totalCredits}}</strong></td>
      </tr>
      <tr>
        <td colspan="3" align="right">{{t 'new_balance' 'New Balance'}}</td>
        <td align="right">{{newBalance}}</td>
      </tr>
    </mj-table>
  </mj-column>
</mj-section>`;

describe('RefreshDefaultUsageReceipt1789900001000', () => {
  const type = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;
  const migration = new RefreshDefaultUsageReceipt1789900001000();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false, entities: [] });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await new EmailTemplates1748886859854().up(queryRunner);
    await new EmailTemplateVariables1748888690640().up(queryRunner);
    await new EmailTemplatesAddBillingSummary1759800000000().up(queryRunner);
    await new EmailTemplateTranslations1782500000000().up(queryRunner);
    await queryRunner.query(
      'INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES (?, ?, ?, ?)',
      [type, 'Custom receipt subject', originalBody, 'user.username,custom.variable'],
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await queryRunner.release();
    await dataSource.destroy();
  });

  async function readTemplate(): Promise<{ subject: string; body: string; variables: string }> {
    const [row] = await queryRunner.query(
      'SELECT "subject", "body", "variables" FROM "email_templates" WHERE "type" = ?',
      [type],
    );
    return row;
  }

  it.each(['\n', '\r\n', '\r'])(
    'upgrades stock body with %j line endings, preserving subject and extra variables',
    async (lineEnding) => {
      await queryRunner.query('UPDATE "email_templates" SET "body" = ?', [originalBody.replace(/\n/g, lineEnding)]);

      await migration.up(queryRunner);

      const template = await readTemplate();
      expect(template.body).toBe(readDefaultTemplateBody(type));
      expect(template.subject).toBe('Custom receipt subject');
      expect(template.variables.split(',')).toEqual(
        expect.arrayContaining([...EMAIL_TEMPLATE_DEFAULTS[type].variables, 'custom.variable']),
      );
      expect(
        await queryRunner.query('SELECT "key", "value" FROM "email_template_translations" WHERE "templateType" = ?', [
          type,
        ]),
      ).toEqual(
        expect.arrayContaining(
          SHIPPED_TRANSLATIONS.filter((row) => row.templateType === type).map(({ key, value }) => ({ key, value })),
        ),
      );
    },
  );

  it('preserves custom body, variables, and translations', async () => {
    const customBody = originalBody.replace('Here is your receipt:', 'Your custom receipt:');
    await queryRunner.query('UPDATE "email_templates" SET "body" = ?', [customBody]);
    await queryRunner.query(
      'INSERT INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)',
      [type, 'item_session_duration', 'de', 'Meine Sitzungszeit'],
    );

    await migration.up(queryRunner);

    expect(await readTemplate()).toEqual({
      subject: 'Custom receipt subject',
      body: customBody,
      variables: 'user.username,custom.variable',
    });
    expect(
      await queryRunner.query('SELECT "value" FROM "email_template_translations" WHERE "key" = ?', [
        'item_session_duration',
      ]),
    ).toEqual([{ value: 'Meine Sitzungszeit' }]);
  });

  it('preserves an administrator body edit between read and write', async () => {
    const customBody = originalBody.replace('Here is your receipt:', 'Custom concurrent edit:');
    const query = queryRunner.query.bind(queryRunner);
    jest.spyOn(queryRunner, 'query').mockImplementationOnce(async (sql, parameters) => {
      const rows = await query(sql, parameters);
      await query('UPDATE "email_templates" SET "body" = ?', [customBody]);
      return rows;
    });

    await migration.up(queryRunner);

    expect((await readTemplate()).body).toBe(customBody);
  });

  it('is idempotent and retains valid content on downgrade', async () => {
    await migration.up(queryRunner);
    const template = await readTemplate();
    const translations = await queryRunner.query('SELECT * FROM "email_template_translations"');
    const changes = await queryRunner.query('SELECT total_changes() AS changes');

    await migration.up(queryRunner);
    await migration.down();

    expect(await readTemplate()).toEqual(template);
    expect(await queryRunner.query('SELECT * FROM "email_template_translations"')).toEqual(translations);
    expect(await queryRunner.query('SELECT total_changes() AS changes')).toEqual(changes);
  });

  it('does nothing when the receipt template is absent', async () => {
    await queryRunner.query('DELETE FROM "email_templates"');
    await migration.up(queryRunner);
    expect(await queryRunner.query('SELECT * FROM "email_template_translations"')).toEqual([]);
  });

  it('retains administrator changes after upgrading and downgrading', async () => {
    await migration.up(queryRunner);
    const customBody = readDefaultTemplateBody(type).replace('Here is your receipt:', 'Custom receipt:');
    await queryRunner.query('UPDATE "email_templates" SET "body" = ?', [customBody]);
    await queryRunner.query('UPDATE "email_template_translations" SET "value" = ? WHERE "key" = ?', [
      'Meine Sitzungszeit',
      'item_session_duration',
    ]);

    await migration.down();

    expect((await readTemplate()).body).toBe(customBody);
    expect(
      await queryRunner.query('SELECT "value" FROM "email_template_translations" WHERE "key" = ?', [
        'item_session_duration',
      ]),
    ).toEqual([{ value: 'Meine Sitzungszeit' }]);
  });
});
