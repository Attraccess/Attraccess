import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovalOfIotConfigs1752008417898 implements MigrationInterface {
  name = 'RemovalOfIotConfigs1752008417898';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mqtt_resource_config"`);
    await queryRunner.query(`DROP TABLE "webhook_config"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mqtt_resource_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "serverId" integer NOT NULL, "inUseTopic" text NOT NULL, "inUseMessage" text NOT NULL, "notInUseTopic" text NOT NULL, "notInUseMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "takeoverTopic" text, "takeoverMessage" text, "onTakeoverSendStart" boolean NOT NULL DEFAULT (0), "onTakeoverSendStop" boolean NOT NULL DEFAULT (0), "onTakeoverSendTakeover" boolean NOT NULL DEFAULT (1), CONSTRAINT "FK_6ea7fa73bd2eb020ae6fc7206a3" FOREIGN KEY ("serverId") REFERENCES "mqtt_server" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_df86aa26ad244673076a0ffc833" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_config" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "name" text NOT NULL, "url" text NOT NULL, "method" text NOT NULL, "headers" text, "inUseTemplate" text NOT NULL, "notInUseTemplate" text NOT NULL, "active" boolean NOT NULL DEFAULT (1), "retryEnabled" boolean NOT NULL DEFAULT (0), "maxRetries" integer NOT NULL DEFAULT (3), "retryDelay" integer NOT NULL DEFAULT (1000), "secret" text, "signatureHeader" text NOT NULL DEFAULT ('X-Webhook-Signature'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "takeoverTemplate" text, "onTakeoverSendStart" boolean NOT NULL DEFAULT (0), "onTakeoverSendStop" boolean NOT NULL DEFAULT (0), "onTakeoverSendTakeover" boolean NOT NULL DEFAULT (1), CONSTRAINT "FK_2ff18641734c27268d49ac3fdd0" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
  }
}
