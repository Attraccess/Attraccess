import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Secure this reader" (ATT-1208): one row per conversion, kept as history. The partial unique index allows one
 * active conversion per installation.
 */
export class AttractapSecureConversion1796300000003 implements MigrationInterface {
  name = 'AttractapSecureConversion1796300000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attractap_secure_conversion" ("id" SERIAL NOT NULL, "readerId" integer NOT NULL, "state" text NOT NULL, "active" boolean NOT NULL DEFAULT true, "failedInState" text, "failureReason" text, "target" jsonb NOT NULL, "digest0" text NOT NULL, "digest1" text NOT NULL, "preflight" jsonb, "verified" boolean NOT NULL DEFAULT false, "bytesDone" integer NOT NULL DEFAULT '0', "bytesTotal" integer NOT NULL DEFAULT '0', "burnReport" jsonb, "actorId" integer, "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "stateChangedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "endedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1eb59276915b4d27bbedd692085" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attractap_secure_conversion_reader" ON "attractap_secure_conversion" ("readerId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_attractap_secure_conversion_one_active" ON "attractap_secure_conversion" ("active") WHERE "active"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_attractap_secure_conversion_one_active"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_attractap_secure_conversion_reader"`);
    await queryRunner.query(`DROP TABLE "attractap_secure_conversion"`);
  }
}
