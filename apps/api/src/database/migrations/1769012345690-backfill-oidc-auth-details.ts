import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillOidcAuthDetails1769012345690 implements MigrationInterface {
  name = 'BackfillOidcAuthDetails1769012345690';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "authentication_detail" ("userId", "type", "providerType", "providerId", "ssoSubject")
      SELECT
        "user"."id",
        'sso',
        'OIDC',
        "provider"."id",
        CASE
          WHEN "user"."externalIdentifier" LIKE 'SSO:OIDC:%'
            THEN SUBSTR("user"."externalIdentifier", 10)
          ELSE "user"."externalIdentifier"
        END
      FROM "user"
      JOIN (
        SELECT "id"
        FROM "sso_provider"
        WHERE "type" = 'OIDC'
        ORDER BY "id"
        LIMIT 1
      ) "provider" ON 1 = 1
      WHERE "user"."externalIdentifier" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "authentication_detail" "auth"
          WHERE "auth"."userId" = "user"."id"
            AND "auth"."type" = 'sso'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "authentication_detail"
      WHERE "type" = 'sso'
        AND "providerType" = 'OIDC'
        AND "providerId" = (
          SELECT "id"
          FROM "sso_provider"
          WHERE "type" = 'OIDC'
          ORDER BY "id"
          LIMIT 1
        )
        AND EXISTS (
          SELECT 1
          FROM "user"
          WHERE "user"."id" = "authentication_detail"."userId"
            AND "user"."externalIdentifier" IS NOT NULL
            AND "authentication_detail"."ssoSubject" = CASE
              WHEN "user"."externalIdentifier" LIKE 'SSO:OIDC:%'
                THEN SUBSTR("user"."externalIdentifier", 10)
              ELSE "user"."externalIdentifier"
            END
        )
    `);
  }
}
