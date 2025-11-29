import { MigrationInterface, QueryRunner } from 'typeorm';

export class FormsSelectInputField1764368253547 implements MigrationInterface {
  name = 'FormsSelectInputField1764368253547';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','boolean','select') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json, CONSTRAINT "FK_2d83d8a334dd66445db13f92b77" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_form_field"("id", "formId", "name", "type", "isRequired", "description", "options") SELECT "id", "formId", "name", "type", "isRequired", "description", "options" FROM "form_field"`,
    );
    await queryRunner.query(`DROP TABLE "form_field"`);
    await queryRunner.query(`ALTER TABLE "temporary_form_field" RENAME TO "form_field"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_field" RENAME TO "temporary_form_field"`);
    await queryRunner.query(
      `CREATE TABLE "form_field" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "formId" integer NOT NULL, "name" text NOT NULL, "type" varchar CHECK( "type" IN ('text','number','datetime','boolean') ) NOT NULL, "isRequired" boolean NOT NULL DEFAULT (0), "description" text, "options" json, CONSTRAINT "FK_2d83d8a334dd66445db13f92b77" FOREIGN KEY ("formId") REFERENCES "form" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "form_field"("id", "formId", "name", "type", "isRequired", "description", "options") SELECT "id", "formId", "name", "type", "isRequired", "description", "options" FROM "temporary_form_field"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_form_field"`);
  }
}
