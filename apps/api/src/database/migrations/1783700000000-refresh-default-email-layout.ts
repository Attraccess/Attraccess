import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { readDefaultLayoutBody } from '../../email-template/email-defaults';

// SHA-256 of DEFAULT_GLOBAL_LAYOUT in 1782200000000-email-layout, with LF line endings.
const ORIGINAL_LAYOUT_SHA256 = '2718caf2fafd1f149396f7d69a436c99209a0673acc291c73fed1c6944663342';

export class RefreshDefaultEmailLayout1783700000000 implements MigrationInterface {
  name = 'RefreshDefaultEmailLayout1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [layout]: Array<{ value: string }> = await queryRunner.query(
      `SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      ['email_layout', 'body'],
    );
    if (!layout) {
      return;
    }

    const hash = createHash('sha256').update(layout.value.replace(/\r\n?/g, '\n')).digest('hex');
    if (hash !== ORIGINAL_LAYOUT_SHA256) {
      return;
    }

    // Compare the original value again so an administrator edit made after the read wins.
    await queryRunner.query(`UPDATE "setting" SET "value" = ? WHERE "parent" = ? AND "key" = ? AND "value" = ?`, [
      readDefaultLayoutBody(),
      'email_layout',
      'body',
      layout.value,
    ]);
  }

  public async down(): Promise<void> {
    // Keep the valid MJML layout on downgrade, including any administrator edits.
  }
}
