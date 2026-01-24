import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoSamlProvider1764705009060 implements MigrationInterface {
  name = 'SsoSamlProvider1764705009060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_provider" ADD COLUMN "type_next" varchar CHECK( "type_next" IN ('OIDC','SAML') ) NOT NULL DEFAULT ('OIDC')`,
    );
    await queryRunner.query(`UPDATE "sso_provider" SET "type_next" = "type"`);
    await queryRunner.query(`ALTER TABLE "sso_provider" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "sso_provider" RENAME COLUMN "type_next" TO "type"`);

    await queryRunner.query(
      `CREATE TABLE "sso_provider_saml_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ssoProviderId" integer NOT NULL, "entryPoint" text NOT NULL, "issuer" text NOT NULL, "certificate" text NOT NULL, "audience" text, "signRequest" boolean NOT NULL DEFAULT (0), "wantAssertionsSigned" boolean NOT NULL DEFAULT (0), "wantAuthnResponseSigned" boolean NOT NULL DEFAULT (1), "forceAuthn" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_4aa907dd907bc5d7bac9c0ed02" UNIQUE ("ssoProviderId"), CONSTRAINT "FK_4aa907dd907bc5d7bac9c0ed02a" FOREIGN KEY ("ssoProviderId") REFERENCES "sso_provider" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sso_provider_saml_configuration"`);

    await queryRunner.query(`DELETE FROM "sso_provider" WHERE "type" = 'SAML'`);
    await queryRunner.query(
      `ALTER TABLE "sso_provider" ADD COLUMN "type_prev" varchar CHECK( "type_prev" IN ('OIDC') ) NOT NULL DEFAULT ('OIDC')`,
    );
    await queryRunner.query(`UPDATE "sso_provider" SET "type_prev" = "type"`);
    await queryRunner.query(`ALTER TABLE "sso_provider" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "sso_provider" RENAME COLUMN "type_prev" TO "type"`);
  }
}
