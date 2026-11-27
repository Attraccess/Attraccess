import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Is the machine OK?" before a user ends their own session, per resource. On by default, so every existing
 * resource asks after the upgrade (on installations licensed for maintenance).
 */
export class ResourceMaintenanceCheck1796500000000 implements MigrationInterface {
  name = 'ResourceMaintenanceCheck1796500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource" ADD "askMaintenanceCheckOnSessionEnd" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "askMaintenanceCheckOnSessionEnd"`);
  }
}
