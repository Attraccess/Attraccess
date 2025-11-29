import { MigrationInterface, QueryRunner } from 'typeorm';

export class FormSubmissionAction1764379170000 implements MigrationInterface {
  name = 'FormSubmissionAction1764379170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_submission" ADD COLUMN "action" text NOT NULL DEFAULT 'start'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_submission" RENAME TO "temporary_form_submission"`);
    await queryRunner.query(
      `CREATE TABLE "form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, "resourceUsageId" integer NOT NULL, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8fe79a10e323103ade852938ec8" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId" FROM "temporary_form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_submission"`);
  }
}

