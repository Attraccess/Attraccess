import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixEmailTemplateVariables1760468005000 implements MigrationInterface {
  name = 'FixEmailTemplateVariables1760468005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ type: string; variables: string | null }> = await queryRunner.query(
      `SELECT "type", "variables" FROM "email_templates"`,
    );

    for (const row of rows) {
      const { type, variables } = row;
      if (variables == null) continue;
      const trimmed = variables.trim();

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const csv = parsed.join(',');
            await queryRunner.query(`UPDATE "email_templates" SET "variables" = $1 WHERE "type" = $2`, [csv, type]);
          }
        } catch {
          // ignore invalid JSON; leave as-is
        }
      }
    }
  }

  public async down(): Promise<void> {
    // no-op
  }
}
