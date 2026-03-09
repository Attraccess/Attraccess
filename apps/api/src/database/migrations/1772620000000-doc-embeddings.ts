import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocEmbeddings1772620000000 implements MigrationInterface {
  name = 'DocEmbeddings1772620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "doc_embedding" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "source" text NOT NULL,
        "chunkIndex" integer NOT NULL,
        "content" text NOT NULL,
        "embedding" text NOT NULL DEFAULT '',
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "doc_embedding"`);
  }
}
