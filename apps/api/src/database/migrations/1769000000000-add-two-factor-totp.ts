import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoFactorTotp1769000000000 implements MigrationInterface {
  name = 'AddTwoFactorTotp1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_7df721b6f867aa8e2a15016076"`);
    await queryRunner.query(`DROP INDEX "IDX_10b2a0a24286319842c8dd0dc8"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_authentication_detail" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "type" varchar CHECK( "type" IN ('local_password','sso','totp') ) NOT NULL, "password" text, "providerType" varchar CHECK( "providerType" IN ('OIDC') ), "providerId" integer, "ssoSubject" text, "totpSecret" text, "totpEnabledAt" datetime, CONSTRAINT "FK_65a0cb4c981b2ebe57d4c546fda" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_authentication_detail"("id", "userId", "type", "password", "providerType", "providerId", "ssoSubject") SELECT "id", "userId", "type", "password", "providerType", "providerId", "ssoSubject" FROM "authentication_detail"`,
    );
    await queryRunner.query(`DROP TABLE "authentication_detail"`);
    await queryRunner.query(`ALTER TABLE "temporary_authentication_detail" RENAME TO "authentication_detail"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_10b2a0a24286319842c8dd0dc8" ON "authentication_detail" ("providerType", "providerId", "ssoSubject") WHERE "providerType" IS NOT NULL AND "providerId" IS NOT NULL AND "ssoSubject" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7df721b6f867aa8e2a15016076" ON "authentication_detail" ("userId", "type") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_7df721b6f867aa8e2a15016076"`);
    await queryRunner.query(`DROP INDEX "IDX_10b2a0a24286319842c8dd0dc8"`);
    await queryRunner.query(`ALTER TABLE "authentication_detail" RENAME TO "temporary_authentication_detail"`);
    await queryRunner.query(
      `CREATE TABLE "authentication_detail" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "type" varchar CHECK( "type" IN ('local_password','sso') ) NOT NULL, "password" text, "providerType" varchar CHECK( "providerType" IN ('OIDC') ), "providerId" integer, "ssoSubject" text, CONSTRAINT "FK_65a0cb4c981b2ebe57d4c546fda" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "authentication_detail"("id", "userId", "type", "password", "providerType", "providerId", "ssoSubject") SELECT "id", "userId", "type", "password", "providerType", "providerId", "ssoSubject" FROM "temporary_authentication_detail"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_authentication_detail"`);
  }
}
