import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowVariables1778000000000 implements MigrationInterface {
  name = 'FlowVariables1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_flow_variable" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"scope" varchar NOT NULL, "resourceId" integer, "key" varchar NOT NULL, ` +
        `"value" text NOT NULL, "valueType" varchar NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `CONSTRAINT "UQ_resource_flow_variable_scope_resource_key" UNIQUE ("scope", "resourceId", "key"), ` +
        `CONSTRAINT "FK_resource_flow_variable_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_flow_variable_resource" ON "resource_flow_variable" ("resourceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_variable_resource"`);
    await queryRunner.query(`DROP TABLE "resource_flow_variable"`);
  }
}
