import { MigrationInterface, QueryRunner } from 'typeorm';
import { readDefaultLayoutBody } from '../../email-template/email-defaults';

export class RefreshDefaultEmailLayout1783700000000 implements MigrationInterface {
  name = 'RefreshDefaultEmailLayout1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [layout]: Array<{ value: string; createdAt: string; updatedAt: string }> = await queryRunner.query(
      `SELECT "value", "createdAt", "updatedAt" FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      ['email_layout', 'body'],
    );
    if (!layout) {
      return;
    }

    if (layout.createdAt !== layout.updatedAt) {
      return;
    }

    // Compare the original timestamps again so an administrator edit made after the read wins.
    await queryRunner.query(
      `UPDATE "setting" SET "value" = ? WHERE "parent" = ? AND "key" = ? AND "createdAt" = ? AND "updatedAt" = ? AND "value" <> ?`,
      [readDefaultLayoutBody(), 'email_layout', 'body', layout.createdAt, layout.updatedAt, readDefaultLayoutBody()],
    );
  }

  public async down(): Promise<void> {
    // Keep the valid MJML layout on downgrade, including any administrator edits.
  }
}
