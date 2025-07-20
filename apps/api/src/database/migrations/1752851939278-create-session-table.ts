import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionTable1752851939278 implements MigrationInterface {
  name = 'CreateSessionTable1752851939278';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "session" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "token" text NOT NULL, "userId" integer NOT NULL, "userAgent" text, "ipAddress" text, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "lastAccessedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_232f8e85d7633bd6ddfad421696" UNIQUE ("token"), CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(`CREATE INDEX "IDX_5d97cf9773002b16861b4bb8ae" ON "session" ("expiresAt") `);
    await queryRunner.query(`CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_232f8e85d7633bd6ddfad42169" ON "session" ("token") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_232f8e85d7633bd6ddfad42169"`);
    await queryRunner.query(`DROP INDEX "IDX_3d2f174ef04fb312fdebd0ddc5"`);
    await queryRunner.query(`DROP INDEX "IDX_5d97cf9773002b16861b4bb8ae"`);
    await queryRunner.query(`DROP TABLE "session"`);
  }
}
