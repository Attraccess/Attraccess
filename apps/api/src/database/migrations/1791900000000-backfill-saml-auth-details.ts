import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

type Row = Record<string, unknown>;

/**
 * Binds legacy SAML users (identified only by `user.externalIdentifier` = NameID) to their SAML provider
 * in `authentication_detail`, so SAML logins can resolve by (SAML, providerId, NameID).
 *
 * The provider of each user is resolved from session evidence first, else the only SAML provider, else the
 * user is skipped (never guessed). A row created by the 1769012345690 OIDC backfill for such a user
 * (OIDC binding to that backfill's lowest-id OIDC provider whose subject is the unprefixed externalIdentifier) is
 * converted to SAML when that is provable. `user.externalIdentifier` is never modified.
 */
export class BackfillSamlAuthDetails1791900000000 implements MigrationInterface {
  name = 'BackfillSamlAuthDetails1791900000000';

  private readonly logger = new Logger(BackfillSamlAuthDetails1791900000000.name);

  public async up(queryRunner: QueryRunner): Promise<void> {
    const samlProviderIds: number[] = (
      await queryRunner.query(`SELECT "id" FROM "sso_provider" WHERE "type" = 'SAML'`)
    ).map((row: Row) => Number(row.id));
    const oidcProviderIds: number[] = (
      await queryRunner.query(`SELECT "id" FROM "sso_provider" WHERE "type" = 'OIDC'`)
    ).map((row: Row) => Number(row.id));
    const users: Row[] = await queryRunner.query(
      `SELECT "id", "externalIdentifier" FROM "user" WHERE "externalIdentifier" IS NOT NULL AND "externalIdentifier" <> '' AND "externalIdentifier" NOT LIKE 'SSO:OIDC:%' ORDER BY "id"`,
    );
    const counts = {
      inserted: 0,
      converted: 0,
      alreadyBound: 0,
      skippedAmbiguous: 0,
      skippedConflict: 0,
      unchanged: 0,
    };

    for (const user of users) {
      const userId = Number(user.id);
      const subject = String(user.externalIdentifier);
      const [existing] = await queryRunner.query(
        `SELECT "id", "providerType", "providerId", "ssoSubject" FROM "authentication_detail" WHERE "userId" = ? AND "type" = 'sso'`,
        [userId],
      );
      if (existing?.providerType === 'SAML') {
        counts.alreadyBound++;
        continue;
      }
      // The 1769012345690 backfill only ever bound to the lowest-id OIDC provider. Provider ids only grow, so a
      // binding to an OIDC provider with a lower-id OIDC provider still existing was not created by it.
      const isMisbound =
        existing?.providerType === 'OIDC' &&
        existing.ssoSubject === subject &&
        !oidcProviderIds.some((id) => id < Number(existing.providerId));
      if (existing && !isMisbound) {
        counts.unchanged++;
        continue;
      }

      // A misbound row is only converted when no OIDC session proves the user really logged in through OIDC.
      if (isMisbound && (await this.hasSubjectSession(queryRunner, userId, subject, 'OIDC'))) {
        counts.unchanged++;
        continue;
      }

      const evidence = await this.findSessionProviders(queryRunner, userId, subject, samlProviderIds);
      let providerId: number | undefined;
      if (evidence.length === 1) providerId = evidence[0];
      else if (evidence.length === 0 && samlProviderIds.length === 1) {
        // Without any session evidence the single SAML provider is a safe resolution. A misbound OIDC row
        // additionally requires that no session of any kind references the subject (it may be a real OIDC user).
        if (!isMisbound || !(await this.hasSubjectSession(queryRunner, userId, subject))) {
          providerId = samlProviderIds[0];
        }
      }
      if (providerId === undefined) {
        counts.skippedAmbiguous++;
        continue;
      }

      const [conflict] = await queryRunner.query(
        `SELECT 1 FROM "authentication_detail" WHERE "providerType" = 'SAML' AND "providerId" = ? AND "ssoSubject" = ?`,
        [providerId, subject],
      );
      if (conflict) {
        counts.skippedConflict++;
        continue;
      }

      if (isMisbound) {
        await queryRunner.query(
          `UPDATE "authentication_detail" SET "providerType" = 'SAML', "providerId" = ? WHERE "id" = ?`,
          [providerId, existing.id],
        );
        counts.converted++;
      } else {
        await queryRunner.query(
          `INSERT INTO "authentication_detail" ("userId", "type", "providerType", "providerId", "ssoSubject") VALUES (?, 'sso', 'SAML', ?, ?)`,
          [userId, providerId, subject],
        );
        counts.inserted++;
      }
    }

    this.logger.log(`SAML auth detail backfill: ${JSON.stringify(counts)}`);
  }

  /** Distinct, still existing SAML providers this user logged in through with this NameID. */
  private async findSessionProviders(
    queryRunner: QueryRunner,
    userId: number,
    subject: string,
    samlProviderIds: number[],
  ): Promise<number[]> {
    const rows: Row[] = await queryRunner.query(
      `SELECT DISTINCT "ssoProviderId" FROM "session" WHERE "userId" = ? AND "ssoProtocol" = 'SAML' AND "ssoSubject" = ?`,
      [userId, subject],
    );
    return rows.map((row) => Number(row.ssoProviderId)).filter((id) => samlProviderIds.includes(id));
  }

  private async hasSubjectSession(
    queryRunner: QueryRunner,
    userId: number,
    subject: string,
    protocol?: 'OIDC' | 'SAML',
  ): Promise<boolean> {
    const [row] = await queryRunner.query(
      `SELECT 1 FROM "session" WHERE "userId" = ? AND "ssoSubject" = ? AND (? IS NULL OR "ssoProtocol" = ?) LIMIT 1`,
      [userId, subject, protocol ?? null, protocol ?? null],
    );
    return !!row;
  }

  /**
   * Best-effort reversal. Whether a row was inserted or converted is not recorded, so every SAML row whose subject
   * equals the owner's externalIdentifier is deleted (rows created by later SAML logins have no externalIdentifier).
   * Converted rows are deliberately not turned back into OIDC bindings: that would restore the cross-provider binding
   * this migration removes. The previous release resolves SAML logins and provisioning by externalIdentifier, which
   * this migration never changes, so those users keep working after the rollback.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "authentication_detail" WHERE "id" IN (
         SELECT "detail"."id" FROM "authentication_detail" "detail"
         JOIN "user" ON "user"."id" = "detail"."userId"
         WHERE "detail"."type" = 'sso' AND "detail"."providerType" = 'SAML' AND "detail"."ssoSubject" = "user"."externalIdentifier"
       )`,
    );
  }
}
