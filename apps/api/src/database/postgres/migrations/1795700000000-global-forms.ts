import { MigrationInterface, QueryRunner } from 'typeorm';

/** Exactly the owner column the scope needs; a deleted group form may have lost its (deleted) group. */
const SCOPE_CHECK =
  `("scope" = 'resource' AND "resourceId" IS NOT NULL AND "groupId" IS NULL) OR ` +
  `("scope" = 'group' AND "resourceId" IS NULL AND ("groupId" IS NOT NULL OR "deletedAt" IS NOT NULL)) OR ` +
  `("scope" = 'global' AND "resourceId" IS NULL AND "groupId" IS NULL)`;

/**
 * Forms that apply to one resource, a resource group or every resource (ATT-796). Every existing form becomes a resource
 * form with the same id, so its fields, submissions and flow templates keep pointing at it. Forms are deleted softly
 * from now on, and a resource can switch an inherited form off or override its required flags.
 */
export class PostgresGlobalForms1795700000000 implements MigrationInterface {
  name = 'PostgresGlobalForms1795700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form" ADD "scope" character varying NOT NULL DEFAULT 'resource'`);
    await queryRunner.query(`ALTER TABLE "form" ADD "groupId" integer`);
    await queryRunner.query(`ALTER TABLE "form" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "form" ALTER COLUMN "resourceId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "form" ADD CONSTRAINT "CHK_form_scope" CHECK (${SCOPE_CHECK})`);
    await queryRunner.query(
      `ALTER TABLE "form" ADD CONSTRAINT "FK_75ea6121b76f11dc03a6334e828" FOREIGN KEY ("groupId") ` +
        `REFERENCES "resource_group"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_form_resource" ON "form" ("resourceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_form_scope_group" ON "form" ("scope", "groupId")`);

    await queryRunner.query(
      `CREATE TABLE "form_resource_override" ("id" SERIAL NOT NULL, "formId" integer NOT NULL, ` +
        `"resourceId" integer NOT NULL, "disabled" boolean NOT NULL DEFAULT false, ` +
        `"isRequiredOnResourceUsageStart" boolean, "isRequiredOnResourceUsageTakeOver" boolean, ` +
        `"isRequiredOnResourceUsageEnd" boolean, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_b30a7735e469e5686bb1bcd7336" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_form_resource_override_form_resource" ON "form_resource_override" ("formId", "resourceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_resource_override_resource" ON "form_resource_override" ("resourceId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_resource_override" ADD CONSTRAINT "FK_1da6b2c0bd0a75a7d08cb072424" FOREIGN KEY ("formId") ` +
        `REFERENCES "form"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_resource_override" ADD CONSTRAINT "FK_493e777464322a3321ba67fe9c9" FOREIGN KEY ("resourceId") ` +
        `REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // The editor loads fields by form, the per-form submissions list pages by form and date, and the usage history
    // looks submissions up by usage.
    await queryRunner.query(`CREATE INDEX "IDX_form_field_form" ON "form_field" ("formId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_form_submission_form_created" ON "form_submission" ("formId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_form_submission_resource_usage" ON "form_submission" ("resourceUsageId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_form_submission_resource_usage"`);
    await queryRunner.query(`DROP INDEX "IDX_form_submission_form_created"`);
    await queryRunner.query(`DROP INDEX "IDX_form_field_form"`);
    await queryRunner.query(`DROP TABLE "form_resource_override"`);

    // Group and global forms have no resource and cannot exist in the old schema, and the old schema has no deleted
    // forms. They go together with their fields and submissions, as deleting a form did before.
    const gone = `SELECT "id" FROM "form" WHERE "resourceId" IS NULL OR "deletedAt" IS NOT NULL`;
    await queryRunner.query(`DELETE FROM "form_submission" WHERE "formId" IN (${gone})`);
    await queryRunner.query(`DELETE FROM "form_field" WHERE "formId" IN (${gone})`);
    await queryRunner.query(`DELETE FROM "form" WHERE "id" IN (${gone})`);

    await queryRunner.query(`DROP INDEX "IDX_form_scope_group"`);
    await queryRunner.query(`DROP INDEX "IDX_form_resource"`);
    await queryRunner.query(`ALTER TABLE "form" DROP CONSTRAINT "FK_75ea6121b76f11dc03a6334e828"`);
    await queryRunner.query(`ALTER TABLE "form" DROP CONSTRAINT "CHK_form_scope"`);
    await queryRunner.query(`ALTER TABLE "form" ALTER COLUMN "resourceId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "groupId"`);
    await queryRunner.query(`ALTER TABLE "form" DROP COLUMN "scope"`);
  }
}
