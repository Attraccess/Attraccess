import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Image fields on forms (ATT-879): the `image` field type, the private image rows and the short-lived reader handoff
 * links that let a phone add images to a reader's open form.
 */
export class FormImages1796200000000 implements MigrationInterface {
  name = 'FormImages1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "form_image_handoff" ("id" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "readerId" integer NOT NULL, "userId" integer NOT NULL, "resourceId" integer NOT NULL, "action" character varying NOT NULL, "formId" integer NOT NULL, "fieldId" integer NOT NULL, "maxImages" integer NOT NULL, "uploadCount" integer NOT NULL DEFAULT '0', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1393717a64c333ecbbf3c6f160a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_form_image_handoff_expires" ON "form_image_handoff" ("expiresAt") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_form_image_handoff_reader" ON "form_image_handoff" ("readerId", "endedAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_form_image_handoff_token" ON "form_image_handoff" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "form_image" ("id" uuid NOT NULL, "userId" integer, "uploadedByUserId" integer, "handoffId" uuid, "formId" integer NOT NULL, "fieldId" integer NOT NULL, "submissionId" integer, "mimeType" character varying NOT NULL, "size" integer NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "filename" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fb579cf6a70091684a8d2c76a15" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_form_image_user" ON "form_image" ("userId") `);
    await queryRunner.query(`CREATE INDEX "IDX_form_image_handoff" ON "form_image" ("handoffId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_form_image_unattached_created" ON "form_image" ("createdAt") WHERE "submissionId" IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_form_image_submission" ON "form_image" ("submissionId") `);
    await queryRunner.query(`ALTER TYPE "public"."form_field_type_enum" ADD VALUE 'image'`);
    await queryRunner.query(
      `ALTER TABLE "form_image_handoff" ADD CONSTRAINT "FK_17ba7edf091325ad8dbfa84b6f6" FOREIGN KEY ("readerId") REFERENCES "attractap"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_image_handoff" ADD CONSTRAINT "FK_37be1786c698bb65fd718125f0e" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_image" ADD CONSTRAINT "FK_b3c4596bf8214aa5b34bf63abc5" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_image" ADD CONSTRAINT "FK_23110ba1d5ed44d85eaeceba63b" FOREIGN KEY ("handoffId") REFERENCES "form_image_handoff"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_image" ADD CONSTRAINT "FK_e6bb3985dc8f71e7b300fbd9e81" FOREIGN KEY ("submissionId") REFERENCES "form_submission"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_image" DROP CONSTRAINT "FK_e6bb3985dc8f71e7b300fbd9e81"`);
    await queryRunner.query(`ALTER TABLE "form_image" DROP CONSTRAINT "FK_23110ba1d5ed44d85eaeceba63b"`);
    await queryRunner.query(`ALTER TABLE "form_image" DROP CONSTRAINT "FK_b3c4596bf8214aa5b34bf63abc5"`);
    await queryRunner.query(`ALTER TABLE "form_image_handoff" DROP CONSTRAINT "FK_37be1786c698bb65fd718125f0e"`);
    await queryRunner.query(`ALTER TABLE "form_image_handoff" DROP CONSTRAINT "FK_17ba7edf091325ad8dbfa84b6f6"`);
    // The old schema has no image fields: they go, as deleting a field did before. Their answers stay in the
    // submissions, which keep a copy of the field definition.
    await queryRunner.query(`DELETE FROM "form_field" WHERE "type" = 'image'`);
    await queryRunner.query(
      `CREATE TYPE "public"."form_field_type_enum_old" AS ENUM('text', 'number', 'boolean', 'select')`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_field" ALTER COLUMN "type" TYPE "public"."form_field_type_enum_old" USING "type"::"text"::"public"."form_field_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."form_field_type_enum"`);
    await queryRunner.query(`ALTER TYPE "public"."form_field_type_enum_old" RENAME TO "form_field_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_submission"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_unattached_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_handoff"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_user"`);
    await queryRunner.query(`DROP TABLE "form_image"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_handoff_token"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_handoff_reader"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_form_image_handoff_expires"`);
    await queryRunner.query(`DROP TABLE "form_image_handoff"`);
  }
}
