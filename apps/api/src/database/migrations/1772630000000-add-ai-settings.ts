import { MigrationInterface, QueryRunner } from 'typeorm';

const AI_PARENT = 'ai';

const DEFAULTS: [string, string][] = [
  ['enabled', 'false'],
  ['ollama_base_url', 'http://localhost:11434'],
  ['chat_model', 'qwen3:8b'],
  ['embed_model', 'nomic-embed-text'],
  ['max_context_chunks', '5'],
];

export class AddAiSettings1772630000000 implements MigrationInterface {
  name = 'AddAiSettings1772630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, value] of DEFAULTS) {
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [AI_PARENT, key],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(
          `INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`,
          [AI_PARENT, key, value],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key] of DEFAULTS) {
      await queryRunner.query(
        `DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [AI_PARENT, key],
      );
    }
  }
}
