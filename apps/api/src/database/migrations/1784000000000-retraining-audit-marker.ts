import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetrainingAuditMarker1784000000000 implements MigrationInterface {
  name = 'RetrainingAuditMarker1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_introduction" ADD COLUMN "retrainingRequiredAuditedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_introduction" DROP COLUMN "retrainingRequiredAuditedAt"`);
  }
}
