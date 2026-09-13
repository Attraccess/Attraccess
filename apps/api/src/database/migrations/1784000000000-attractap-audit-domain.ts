import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapAuditDomain1784000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`INSERT INTO "setting" ("parent", "key", "value")
      VALUES ('audit', 'domains', '["resource","wago","identity","attractap"]')
      ON CONFLICT ("parent", "key") DO UPDATE SET "value" = json_insert("setting"."value", '$[#]', 'attractap')
      WHERE json_valid("setting"."value") AND json_type("setting"."value") = 'array'
        AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid("setting"."value") THEN "setting"."value" ELSE '[]' END) WHERE value = 'attractap')`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`UPDATE "setting" SET "value" = (
      SELECT json_group_array(value) FROM json_each("setting"."value") WHERE value != 'attractap'
    ) WHERE "parent" = 'audit' AND "key" = 'domains'
      AND json_valid("value") AND json_type("value") = 'array'`);
  }
}
