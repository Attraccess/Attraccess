import { MigrationInterface, QueryRunner } from 'typeorm';

export class Messaging1779400000000 implements MigrationInterface {
  name = 'Messaging1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "conversation" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "conversation_participant" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversationId" integer NOT NULL,
        "userId" integer NOT NULL,
        "lastReadAt" datetime,
        CONSTRAINT "FK_conversation_participant_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversation" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_conversation_participant_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_conversation_participant_conversation_user" ON "conversation_participant" ("conversationId", "userId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "message" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversationId" integer NOT NULL,
        "senderId" integer NOT NULL,
        "content" text NOT NULL,
        "referenceType" text,
        "referenceId" integer,
        "referenceLabel" text,
        "referenceUrl" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_message_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversation" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_message_sender" FOREIGN KEY ("senderId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_message_conversation_created" ON "message" ("conversationId", "createdAt")`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_message_sender" ON "message" ("senderId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_message_sender"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_message_conversation_created"`);
    await queryRunner.query(`DROP TABLE "message"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_participant_conversation_user"`);
    await queryRunner.query(`DROP TABLE "conversation_participant"`);
    await queryRunner.query(`DROP TABLE "conversation"`);
  }
}
