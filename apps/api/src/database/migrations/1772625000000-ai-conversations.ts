import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiConversations1772625000000 implements MigrationInterface {
  name = 'AiConversations1772625000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_conversation" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "uuid" text NOT NULL,
        "userId" integer NOT NULL,
        "title" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_ai_conversation_uuid" UNIQUE ("uuid"),
        CONSTRAINT "FK_ai_conversation_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "ai_conversation_message" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversationId" integer NOT NULL,
        "role" text NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "toolCalls" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_ai_conversation_message_conversation" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation" ("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_conversation_message"`);
    await queryRunner.query(`DROP TABLE "ai_conversation"`);
  }
}
