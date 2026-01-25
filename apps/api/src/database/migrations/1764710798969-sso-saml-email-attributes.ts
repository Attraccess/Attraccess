import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoSamlEmailAttributes1764710798969 implements MigrationInterface {
  name = 'SsoSamlEmailAttributes1764710798969';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sso_provider_saml_configuration" ADD COLUMN "emailAttributeKeys" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sso_provider_saml_configuration" RENAME TO "temporary_sso_provider_saml_configuration"`,
    );
    await queryRunner.query(
      `CREATE TABLE "sso_provider_saml_configuration" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ssoProviderId" integer NOT NULL, "entryPoint" text NOT NULL, "issuer" text NOT NULL, "certificate" text NOT NULL, "audience" text, "signRequest" boolean NOT NULL DEFAULT (0), "wantAssertionsSigned" boolean NOT NULL DEFAULT (0), "wantAuthnResponseSigned" boolean NOT NULL DEFAULT (1), "forceAuthn" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_4aa907dd907bc5d7bac9c0ed02" UNIQUE ("ssoProviderId"), CONSTRAINT "FK_4aa907dd907bc5d7bac9c0ed02a" FOREIGN KEY ("ssoProviderId") REFERENCES "sso_provider" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "sso_provider_saml_configuration"("id", "ssoProviderId", "entryPoint", "issuer", "certificate", "audience", "signRequest", "wantAssertionsSigned", "wantAuthnResponseSigned", "forceAuthn", "createdAt", "updatedAt") SELECT "id", "ssoProviderId", "entryPoint", "issuer", "certificate", "audience", "signRequest", "wantAssertionsSigned", "wantAuthnResponseSigned", "forceAuthn", "createdAt", "updatedAt" FROM "temporary_sso_provider_saml_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sso_provider_saml_configuration"`);
  }
}
