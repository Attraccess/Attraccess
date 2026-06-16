import { MigrationInterface, QueryRunner } from 'typeorm';

const EMAIL_LAYOUT_SETTINGS_PARENT = 'email_layout';
const EMAIL_LAYOUT_SETTINGS_KEY = 'body';

const DEFAULT_GLOBAL_LAYOUT = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button
        background-color="#2563EB"
        color="#FFFFFF"
        font-size="16px"
        font-weight="bold"
        padding="15px 30px"
        border-radius="4px"
        text-decoration="none"
      />
    </mj-attributes>
    <mj-style>
      a { color: inherit !important; text-decoration: none !important; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="24px" color="#1E40AF" font-weight="bold" padding="0">
          Attraccess
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" />
      </mj-column>
    </mj-section>

    {{content}}

    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center" padding="5px 0 0 0">
          Visit us:
          <a href="{{host.frontend}}">{{host.frontend}}</a> |
          <a href="https://github.com/Attraccess/Attraccess">GitHub</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

function extractMjmlBodyContent(mjml: string): string | null {
  const match = mjml.match(/<mj-body[^>]*>([\s\S]*?)<\/mj-body>/i);
  return match ? match[1].trim() : null;
}

export class EmailLayout1781700000000 implements MigrationInterface {
  name = 'EmailLayout1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ($1, $2, $3)`,
      [EMAIL_LAYOUT_SETTINGS_PARENT, EMAIL_LAYOUT_SETTINGS_KEY, DEFAULT_GLOBAL_LAYOUT],
    );

    const templates: Array<{ type: string; body: string }> = await queryRunner.query(
      `SELECT "type", "body" FROM "email_templates"`,
    );

    for (const template of templates) {
      const bodyContent = extractMjmlBodyContent(template.body);
      if (bodyContent !== null) {
        await queryRunner.query(`UPDATE "email_templates" SET "body" = $1 WHERE "type" = $2`, [
          bodyContent,
          template.type,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = $1 AND "key" = $2`,
      [EMAIL_LAYOUT_SETTINGS_PARENT, EMAIL_LAYOUT_SETTINGS_KEY],
    );
  }
}
