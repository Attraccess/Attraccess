import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateLimitFieldsToUser1774981000000 implements MigrationInterface {
  name = 'AddRateLimitFieldsToUser1774981000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "lastVerificationEmailSentAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "lastPasswordResetSentAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "failedLoginCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "loginLockedUntil" datetime`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "loginLockedUntil"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "failedLoginCount"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastPasswordResetSentAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastVerificationEmailSentAt"`);
  }
}
