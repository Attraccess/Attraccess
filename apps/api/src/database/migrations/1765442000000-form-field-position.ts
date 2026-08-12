import { MigrationInterface, QueryRunner } from 'typeorm';

export class FormFieldPosition1765442000000 implements MigrationInterface {
  name = 'FormFieldPosition1765442000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_field" ADD COLUMN "position" integer NOT NULL DEFAULT (0)`);
    await queryRunner.query(
      `UPDATE "form_field" SET "position" = (SELECT cnt - 1 FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY "formId" ORDER BY "id" ASC) AS cnt FROM "form_field") sub WHERE sub.id = "form_field".id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_field" RENAME TO "temporary_form_field"`);
    await queryRunner.query(
      `CREATE TABLE "form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','boolean','select') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json, CONSTRAINT "FK_2d83d8a334dd66445db13f92b77" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_field"("id", "formId", "name", "type", "isRequired", "description", "options") SELECT "id", "formId", "name", "type", "isRequired", "description", "options" FROM "temporary_form_field"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_field"`);
  }
}
