import { MigrationInterface, QueryRunner } from 'typeorm';

export class SsoCentralLogout1791400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    for (const [name, type] of [
      ['ssoProviderId', 'integer'],
      ['ssoProtocol', 'text'],
      ['ssoSubject', 'text'],
      ['ssoSessionId', 'text'],
      ['ssoContext', 'text'],
    ]) {
      await runner.query(`ALTER TABLE "session" ADD COLUMN "${name}" ${type}`);
    }
    await runner.query(
      'CREATE INDEX "IDX_session_sso_subject" ON "session" ("ssoProviderId", "ssoProtocol", "ssoSubject")',
    );
    await runner.query(
      'CREATE INDEX "IDX_session_sso_sid" ON "session" ("ssoProviderId", "ssoProtocol", "ssoSessionId")',
    );
    for (const name of ['endSessionURL', 'jwksURL', 'signingAlgorithms']) {
      await runner.query(`ALTER TABLE "sso_provider_oidc_configuration" ADD COLUMN "${name}" text`);
    }
    for (const name of ['idpIssuer', 'logoutURL']) {
      await runner.query(`ALTER TABLE "sso_provider_saml_configuration" ADD COLUMN "${name}" text`);
    }
    await runner.query(
      'CREATE TABLE "sso_logout_state" ("key" text PRIMARY KEY NOT NULL, "value" text NOT NULL, "expiresAt" integer NOT NULL)',
    );
    await runner.query('CREATE INDEX "IDX_sso_logout_expiry" ON "sso_logout_state" ("expiresAt")');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "sso_logout_state"');
    await runner.query('DROP INDEX "IDX_session_sso_subject"');
    await runner.query('DROP INDEX "IDX_session_sso_sid"');
    for (const name of ['ssoProviderId', 'ssoProtocol', 'ssoSubject', 'ssoSessionId', 'ssoContext']) {
      await runner.query(`ALTER TABLE "session" DROP COLUMN "${name}"`);
    }
    for (const name of ['endSessionURL', 'jwksURL', 'signingAlgorithms']) {
      await runner.query(`ALTER TABLE "sso_provider_oidc_configuration" DROP COLUMN "${name}"`);
    }
    for (const name of ['idpIssuer', 'logoutURL']) {
      await runner.query(`ALTER TABLE "sso_provider_saml_configuration" DROP COLUMN "${name}"`);
    }
  }
}
