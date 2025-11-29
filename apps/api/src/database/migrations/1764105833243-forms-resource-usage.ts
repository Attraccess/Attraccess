import { MigrationInterface, QueryRunner } from 'typeorm';

export class FormsResourceUsage1764105833243 implements MigrationInterface {
  name = 'FormsResourceUsage1764105833243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, "resourceUsageId" integer NOT NULL, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId" FROM "form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "form_submission"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_submission" RENAME TO "form_submission"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, "resourceUsageId" integer NOT NULL, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8fe79a10e323103ade852938ec8" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId" FROM "form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "form_submission"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_submission" RENAME TO "form_submission"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_submission" RENAME TO "temporary_form_submission"`);
    await queryRunner.query(
      `CREATE TABLE "form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, "resourceUsageId" integer NOT NULL, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId", "resourceUsageId" FROM "temporary_form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_submission"`);
    await queryRunner.query(`ALTER TABLE "form_submission" RENAME TO "temporary_form_submission"`);
    await queryRunner.query(
      `CREATE TABLE "form_submission" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "data" json NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer NOT NULL, CONSTRAINT "FK_df8fce71531e6d42f58b1b5470e" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0c044839ddb8d7bef1c8762a3ce" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_submission"("id", "formId", "data", "createdAt", "updatedAt", "userId") SELECT "id", "formId", "data", "createdAt", "updatedAt", "userId" FROM "temporary_form_submission"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_submission"`);
  }
}
