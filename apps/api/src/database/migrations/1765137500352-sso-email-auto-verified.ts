import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoEmailAutoVerified1765137500352 implements MigrationInterface {
  name = 'SsoEmailAutoVerified1765137500352';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // auto verify email for all sso users
    await queryRunner.query(`
      UPDATE "user" 
      SET "isEmailVerified" = 1 
      WHERE "externalIdentifier" IS NOT NULL 
      AND "id" NOT IN (
        SELECT DISTINCT "userId" 
        FROM "authentication_detail"
      )
    `);

    // update external identifier for all sso users
    await queryRunner.query(`
      UPDATE "user" 
      SET "externalIdentifier" = 'SSO:OIDC:' || "externalIdentifier"
      WHERE "externalIdentifier" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // remove the SSO:OIDC prefix we added to external identifiers
    await queryRunner.query(`
      UPDATE "user"
      SET "externalIdentifier" = SUBSTRING("externalIdentifier" FROM 10)
      WHERE "externalIdentifier" LIKE 'SSO:OIDC:%'
    `);
  }
}
