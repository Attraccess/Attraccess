import { MigrationInterface, QueryRunner } from 'typeorm';

const EMAIL_LAYOUT_SETTINGS_PARENT = 'email_layout';
const EMAIL_LAYOUT_SETTINGS_KEY = 'body';
const LOGO_SOURCE = /((?:^|\s)src\s*=\s*)(["'])\{\{host\.logoUrl\}\}\2/g;
const INLINE_LOGO_SOURCE = /((?:^|\s)src\s*=\s*)(["'])cid:attraccess-logo\2/g;

export const PREVIOUS_DEFAULT_GLOBAL_LAYOUT = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" color="#1F2937" />
      <mj-button
        background-color="#2563EB"
        color="#FFFFFF"
        font-size="16px"
        font-weight="bold"
        padding="12px 30px"
        border-radius="6px"
        text-decoration="none"
      />
    </mj-attributes>
    <mj-style>
      a { color: #2563EB; text-decoration: none; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F8FAFC" width="600px">
    <mj-section background-color="#FFFFFF" padding="24px 0 16px 0">
      <mj-column>
        <mj-image
          src="{{host.logoUrl}}"
          width="200px"
          href="https://attraccess.org"
          alt="Attraccess"
          padding="0"
        />
      </mj-column>
    </mj-section>

    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" border-width="1px" />
      </mj-column>
    </mj-section>

    {{content}}

    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" border-width="1px" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="16px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#9CA3AF" align="center" padding="0">
          <a href="https://attraccess.org" style="color:#9CA3AF;">attraccess.org</a>
          &nbsp;·&nbsp;
          <a href="{{host.frontend}}" style="color:#9CA3AF;">{{host.frontend}}</a>
          &nbsp;·&nbsp;
          <a href="{{host.notificationPreferencesUrl}}" style="color:#9CA3AF;">Notification preferences</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export const INLINE_LOGO_GLOBAL_LAYOUT = PREVIOUS_DEFAULT_GLOBAL_LAYOUT.replace(
  'src="{{host.logoUrl}}"',
  'src="cid:attraccess-logo"',
);

export class EmailLayoutInlineLogo1783500000000 implements MigrationInterface {
  name = 'EmailLayoutInlineLogo1783500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceLogoSource(queryRunner, LOGO_SOURCE, '$1$2cid:attraccess-logo$2');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceLogoSource(queryRunner, INLINE_LOGO_SOURCE, '$1$2{{host.logoUrl}}$2');
  }

  private async replaceLogoSource(queryRunner: QueryRunner, source: RegExp, replacement: string): Promise<void> {
    const [setting] = (await queryRunner.query(`SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?`, [
      EMAIL_LAYOUT_SETTINGS_PARENT,
      EMAIL_LAYOUT_SETTINGS_KEY,
    ])) as Array<{ value: string }>;

    if (!setting) {
      return;
    }

    const value = setting.value.replace(source, replacement);
    if (value === setting.value) {
      return;
    }

    await queryRunner.query(
      `UPDATE "setting"
       SET "value" = ?
       WHERE "parent" = ? AND "key" = ?`,
      [value, EMAIL_LAYOUT_SETTINGS_PARENT, EMAIL_LAYOUT_SETTINGS_KEY],
    );
  }
}
