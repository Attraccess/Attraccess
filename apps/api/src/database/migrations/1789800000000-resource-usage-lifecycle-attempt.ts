import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceUsageLifecycleAttempt1789800000000 implements MigrationInterface {
  name = 'ResourceUsageLifecycleAttempt1789800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "resource_usage" ADD "lifecyclePending" boolean NOT NULL DEFAULT false');
    await queryRunner.query(`CREATE TABLE "resource_usage_lifecycle_attempt" (
      "id" varchar PRIMARY KEY NOT NULL,
      "resourceId" integer NOT NULL,
      "kind" varchar NOT NULL,
      "candidateUsageId" integer,
      "previousUsageId" integer,
      "transitionTime" datetime NOT NULL,
      "formSubmissions" text NOT NULL,
      "billingItems" text NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT "FK_resource_usage_lifecycle_attempt_resource" FOREIGN KEY ("resourceId")
        REFERENCES "resource" ("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_resource_usage_lifecycle_attempt_resource" ON "resource_usage_lifecycle_attempt" ("resourceId")',
    );
    await this.updateLegacyUsageView(queryRunner, true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reservations have no bill or submitted forms. A downgrade aborts them like restart recovery.
    await queryRunner.query('DELETE FROM "resource_usage" WHERE "lifecyclePending" = true');
    await queryRunner.query('DROP TABLE "resource_usage_lifecycle_attempt"');
    await this.updateLegacyUsageView(queryRunner, false);
    await queryRunner.query('ALTER TABLE "resource_usage" DROP COLUMN "lifecyclePending"');
  }

  private async updateLegacyUsageView(queryRunner: QueryRunner, excludePending: boolean): Promise<void> {
    const views = await queryRunner.query("SELECT name FROM sqlite_master WHERE type = 'view' AND name = ?", [
      'resource_computed_view',
    ]);
    if (views.length === 0) return;
    const definition = `SELECT "resource"."id" AS "id", COALESCE(SUM("usage"."usageInMinutes"), -1) AS "totalUsageMinutes" FROM "resource" "resource" LEFT JOIN "resource_usage" "usage" ON "usage"."resourceId" = "resource"."id"${excludePending ? ' AND "usage"."lifecyclePending" = false' : ''} GROUP BY "resource"."id"`;
    await queryRunner.query('DROP VIEW "resource_computed_view"');
    await queryRunner.query(`CREATE VIEW "resource_computed_view" AS ${definition}`);
    await queryRunner.query('UPDATE "typeorm_metadata" SET "value" = ? WHERE "type" = ? AND "name" = ?', [
      definition,
      'VIEW',
      'resource_computed_view',
    ]);
  }
}
