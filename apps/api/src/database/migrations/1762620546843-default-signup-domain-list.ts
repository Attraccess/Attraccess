import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultSignupDomainList1762620546843 implements MigrationInterface {
  name = 'DefaultSignupDomainList1762620546843';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "setting"("parent", "key", "value") VALUES ('auth', 'local_signup_domain_whitelist', '*')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = 'auth' AND "key" = 'local_signup_domain_whitelist'`,
    );
  }
}
