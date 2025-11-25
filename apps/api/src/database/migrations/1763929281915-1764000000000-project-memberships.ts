import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectMemberships1763929281915 implements MigrationInterface {
  name = 'ProjectMemberships1763929281915';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "temporary_email_templates" (
        "type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary','project-invitation') ) PRIMARY KEY NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "variables" text NOT NULL
      )
    `);
    await queryRunner.query(
      `INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);

    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "projectId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" varchar CHECK( "role" IN ('viewer') ) NOT NULL DEFAULT ('viewer'),
        "joinedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_project_member_project_user" UNIQUE ("projectId", "userId"),
        CONSTRAINT "FK_project_member_project" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_project_member_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "project_invitations" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "projectId" integer NOT NULL,
        "inviterId" integer NOT NULL,
        "invitedUserId" integer NOT NULL,
        "status" varchar CHECK( "status" IN ('pending','accepted','declined','canceled') ) NOT NULL DEFAULT ('pending'),
        "requestedRole" varchar CHECK( "requestedRole" IN ('viewer') ) NOT NULL DEFAULT ('viewer'),
        "respondedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_project_invitation_project" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_project_invitation_inviter" FOREIGN KEY ("inviterId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_project_invitation_user" FOREIGN KEY ("invitedUserId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_project_invitation_pending_by_user" ON "project_invitations" ("invitedUserId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_project_invitation_pending_by_user"`);
    await queryRunner.query(`DROP TABLE "project_invitations"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(`
      CREATE TABLE "email_templates" (
        "type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary') ) PRIMARY KEY NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "variables" text NOT NULL
      )
    `);
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
  }
}
