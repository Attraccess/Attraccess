import { MigrationInterface, QueryRunner } from "typeorm";

export class ResourceGroups1744911268510 implements MigrationInterface {
    name = 'ResourceGroups1744911268510'

    // Helper constants for view definition to avoid duplication
    private readonly viewName = `"resource_computed_view"`;
    private readonly viewDefinition = `SELECT "resource"."id" AS "id", COALESCE(SUM("usage"."usageInMinutes"), -1) AS "totalUsageMinutes" FROM "resource" "resource" LEFT JOIN "resource_usage" "usage" ON "usage"."resourceId" = "resource"."id" GROUP BY "resource"."id"`;

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the dependent view first
        await queryRunner.query(`DROP VIEW IF EXISTS ${this.viewName}`);

        // --- Create resource_group table ---
        // This replaces the incorrect attempt to modify a non-existent table
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "resource_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
        );

        // --- Modify resource table (remove groupId) ---
        // Keep only one block for modifying the resource table
        await queryRunner.query(`CREATE TABLE "temporary_resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" text, "imageFilename" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_resource"("id", "name", "description", "imageFilename", "createdAt", "updatedAt") SELECT "id", "name", "description", "imageFilename", "createdAt", "updatedAt" FROM "resource"`);
        await queryRunner.query(`DROP TABLE "resource"`);
        await queryRunner.query(`ALTER TABLE "temporary_resource" RENAME TO "resource"`);

        // --- Modify resource_introduction (add resourceGroupId, FK, make resourceId nullable) ---
        // Keep only one block
        await queryRunner.query(`CREATE TABLE "temporary_resource_introduction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer, "receiverUserId" integer NOT NULL, "tutorUserId" integer, "completedAt" datetime NOT NULL DEFAULT (datetime('now')), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_bef5cdb0c4699414e813acfb683" FOREIGN KEY ("tutorUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_275626e28c839888d63e6a7d2c1" FOREIGN KEY ("receiverUserId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_resource_introduction_resource_group" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_1693bbfb15013a1ec119e9f9c0d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        // Important: Copy existing data, resourceId becomes nullable, add resourceGroupId (as NULL initially)
        await queryRunner.query(`INSERT INTO "temporary_resource_introduction"("id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", "resourceGroupId") SELECT "id", "resourceId", "receiverUserId", "tutorUserId", "completedAt", "createdAt", NULL FROM "resource_introduction"`);
        await queryRunner.query(`DROP TABLE "resource_introduction"`);
        await queryRunner.query(`ALTER TABLE "temporary_resource_introduction" RENAME TO "resource_introduction"`);


        // --- Modify resource_introduction_user (add resourceGroupId, FK, make resourceId nullable) ---
        // Keep only one block
        await queryRunner.query(`CREATE TABLE "temporary_resource_introduction_user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer, "userId" integer NOT NULL, "grantedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceGroupId" integer, CONSTRAINT "FK_resource_introduction_user_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_12a2193fc2a76b7cbc8fcb1aef8" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_resource_introduction_user_resource_group" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
         // Important: Copy existing data, resourceId becomes nullable, add resourceGroupId (as NULL initially)
        await queryRunner.query(`INSERT INTO "temporary_resource_introduction_user"("id", "resourceId", "userId", "grantedAt", "resourceGroupId") SELECT "id", "resourceId", "userId", "grantedAt", NULL FROM "resource_introduction_user"`);
        await queryRunner.query(`DROP TABLE "resource_introduction_user"`);
        await queryRunner.query(`ALTER TABLE "temporary_resource_introduction_user" RENAME TO "resource_introduction_user"`);

        // --- Create resource_groups_resource_group join table ---
        // Simplified from the original - create directly with FKs if possible in SQLite syntax used by TypeORM
        // Sticking to original create table + indexes, then add FKs via temp table as it's safer across DBs/versions
        await queryRunner.query(`DROP TABLE IF EXISTS "resource_groups_resource_group"`);
        await queryRunner.query(
            `CREATE TABLE "resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, PRIMARY KEY ("resourceId", "resourceGroupId"))`
        );
        await queryRunner.query(`CREATE INDEX "IDX_resource_groups_resource_group_resourceId" ON "resource_groups_resource_group" ("resourceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_resource_groups_resource_group_resourceGroupId" ON "resource_groups_resource_group" ("resourceGroupId") `);
        // Add FKs using temporary table method
        await queryRunner.query(`CREATE TABLE "temporary_resource_groups_resource_group" ("resourceId" integer NOT NULL, "resourceGroupId" integer NOT NULL, CONSTRAINT "FK_resource_groups_resource_group_resourceId" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_resource_groups_resource_group_resourceGroupId" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("resourceId", "resourceGroupId"))`);
        await queryRunner.query(`INSERT INTO "temporary_resource_groups_resource_group"("resourceId", "resourceGroupId") SELECT "resourceId", "resourceGroupId" FROM "resource_groups_resource_group"`);
        await queryRunner.query(`DROP TABLE "resource_groups_resource_group"`);
        await queryRunner.query(`ALTER TABLE "temporary_resource_groups_resource_group" RENAME TO "resource_groups_resource_group"`);
        // Recreate indices after rename
        await queryRunner.query(`CREATE INDEX "IDX_resource_groups_resource_group_resourceId" ON "resource_groups_resource_group" ("resourceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_resource_groups_resource_group_resourceGroupId" ON "resource_groups_resource_group" ("resourceGroupId") `);


        // Recreate the view after all table modifications
        await queryRunner.query(`CREATE VIEW ${this.viewName} AS ${this.viewDefinition}`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP VIEW IF EXISTS ${this.viewName}`);
        await queryRunner.query(`CREATE VIEW ${this.viewName} AS ${this.viewDefinition}`);
    }

}
