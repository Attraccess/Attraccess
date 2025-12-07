import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupUsernames1765143247814 implements MigrationInterface {
  name = 'CleanupUsernames1765143247814';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "user" SET "username" = LOWER(TRIM("username"))`);
  }

  public async down(): Promise<void> {
    // nothing to do here
  }
}
