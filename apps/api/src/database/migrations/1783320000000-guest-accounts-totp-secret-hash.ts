import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuestAccountsTotpSecretHash1783320000000 implements MigrationInterface {
  name = 'GuestAccountsTotpSecretHash1783320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "authentication_detail" ADD "totpSecretHash" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_authentication_detail_guest_otp_secret_hash" ON "authentication_detail" ("totpSecretHash") WHERE "type" = 'guest_otp' AND "totpSecretHash" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_authentication_detail_guest_otp_secret_hash"`);
    await queryRunner.dropColumn('authentication_detail', 'totpSecretHash');
  }
}
