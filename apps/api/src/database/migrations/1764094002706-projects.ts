import { MigrationInterface, QueryRunner } from "typeorm";

export class Projects1764094002706 implements MigrationInterface {
    name = 'Projects1764094002706'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_project_member_project_user" UNIQUE ("projectId", "userId"))`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_invitation_pending_by_user"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'))`);
        await queryRunner.query(`INSERT INTO "temporary_project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "project_invitations"`);
        await queryRunner.query(`DROP TABLE "project_invitations"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_invitations" RENAME TO "project_invitations"`);
        await queryRunner.query(`CREATE INDEX "IDX_project_invitation_pending_by_user" ON "project_invitations" ("invitedUserId", "status") `);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_invitation_pending_by_user"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`CREATE TABLE "temporary_email_templates" ("type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary','project-invitation') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`);
        await queryRunner.query(`INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`);
        await queryRunner.query(`DROP TABLE "email_templates"`);
        await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'))`);
        await queryRunner.query(`INSERT INTO "temporary_project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "project_invitations"`);
        await queryRunner.query(`DROP TABLE "project_invitations"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_invitations" RENAME TO "project_invitations"`);
        await queryRunner.query(`CREATE INDEX "IDX_26ead93d41194350fe5ce5dd11" ON "project_invitations" ("invitedUserId", "status") `);
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_326b2a901eb18ac24eabc9b0581" UNIQUE ("projectId", "userId"))`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_326b2a901eb18ac24eabc9b0581" UNIQUE ("projectId", "userId"), CONSTRAINT "FK_d19892d8f03928e5bfc7313780c" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08d1346ff91abba68e5a637cfdb" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "project_members"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_members" RENAME TO "project_members"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_26ead93d41194350fe5ce5dd11"`);
        await queryRunner.query(`CREATE TABLE "temporary_project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), CONSTRAINT "FK_55c8a93fcb3af8430c930e3a26a" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_fec031ecae4c834159164616812" FOREIGN KEY ("inviterId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_0cd3b1b5700b87dab2f2c4848b9" FOREIGN KEY ("invitedUserId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "project_invitations"`);
        await queryRunner.query(`DROP TABLE "project_invitations"`);
        await queryRunner.query(`ALTER TABLE "temporary_project_invitations" RENAME TO "project_invitations"`);
        await queryRunner.query(`CREATE INDEX "IDX_26ead93d41194350fe5ce5dd11" ON "project_invitations" ("invitedUserId", "status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_26ead93d41194350fe5ce5dd11"`);
        await queryRunner.query(`ALTER TABLE "project_invitations" RENAME TO "temporary_project_invitations"`);
        await queryRunner.query(`CREATE TABLE "project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'))`);
        await queryRunner.query(`INSERT INTO "project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "temporary_project_invitations"`);
        await queryRunner.query(`DROP TABLE "temporary_project_invitations"`);
        await queryRunner.query(`CREATE INDEX "IDX_26ead93d41194350fe5ce5dd11" ON "project_invitations" ("invitedUserId", "status") `);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_326b2a901eb18ac24eabc9b0581" UNIQUE ("projectId", "userId"))`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_26ead93d41194350fe5ce5dd11"`);
        await queryRunner.query(`ALTER TABLE "project_invitations" RENAME TO "temporary_project_invitations"`);
        await queryRunner.query(`CREATE TABLE "project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'))`);
        await queryRunner.query(`INSERT INTO "project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "temporary_project_invitations"`);
        await queryRunner.query(`DROP TABLE "temporary_project_invitations"`);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
        await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
        await queryRunner.query(`CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary','project-invitation') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`);
        await queryRunner.query(`INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`);
        await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_project_member_project_user" UNIQUE ("projectId", "userId"))`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
        await queryRunner.query(`CREATE INDEX "IDX_project_invitation_pending_by_user" ON "project_invitations" ("invitedUserId", "status") `);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_invitation_pending_by_user"`);
        await queryRunner.query(`ALTER TABLE "project_invitations" RENAME TO "temporary_project_invitations"`);
        await queryRunner.query(`CREATE TABLE "project_invitations" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "inviterId" integer NOT NULL, "invitedUserId" integer NOT NULL, "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'), "respondedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), CONSTRAINT "FK_project_invitation_user" FOREIGN KEY ("invitedUserId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_project_invitation_inviter" FOREIGN KEY ("inviterId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_project_invitation_project" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "project_invitations"("id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole") SELECT "id", "projectId", "inviterId", "invitedUserId", "status", "respondedAt", "createdAt", "updatedAt", "requestedRole" FROM "temporary_project_invitations"`);
        await queryRunner.query(`DROP TABLE "temporary_project_invitations"`);
        await queryRunner.query(`CREATE INDEX "IDX_project_invitation_pending_by_user" ON "project_invitations" ("invitedUserId", "status") `);
        await queryRunner.query(`ALTER TABLE "project_members" RENAME TO "temporary_project_members"`);
        await queryRunner.query(`CREATE TABLE "project_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'), "joinedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_project_member_project_user" UNIQUE ("projectId", "userId"), CONSTRAINT "FK_project_member_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_project_member_project" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "project_members"("id", "projectId", "userId", "role", "joinedAt") SELECT "id", "projectId", "userId", "role", "joinedAt" FROM "temporary_project_members"`);
        await queryRunner.query(`DROP TABLE "temporary_project_members"`);
    }

}
