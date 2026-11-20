/**
 * Tables and metadata the entities do not describe: TypeORM's own metadata table (it records the generated
 * column so a later `migration:generate` does not see a difference), the usage recovery journal, the legacy audit
 * overflow of the password policy and the SSO logout state of the database session store.
 */
export const EXTRA_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" character varying NOT NULL, "database" character varying, "schema" character varying, "table" character varying, "name" character varying, "value" text)`,
  // database and schema are read from the connection: the same baseline serves every database name and DATABASE_SCHEMA.
  `INSERT INTO "typeorm_metadata" ("database", "schema", "table", "type", "name", "value")
   SELECT current_database(), current_schema(), 'resource_usage', 'GENERATED_COLUMN', 'usageInMinutes', 'CASE
      WHEN "endTime" IS NULL THEN -1
      ELSE EXTRACT(EPOCH FROM ("endTime" - "startTime")) / 60.0
    END'
   WHERE NOT EXISTS (SELECT 1 FROM "typeorm_metadata" WHERE "type" = 'GENERATED_COLUMN' AND "table" = 'resource_usage'
     AND "name" = 'usageInMinutes')`,
  // A separate, durable recovery journal. Historical identifiers have no foreign keys: deleting a session or a
  // resource must not cascade away recovery evidence.
  `CREATE TABLE "resource_usage_recovery" (
    "id" SERIAL NOT NULL,
    "usageId" integer NOT NULL,
    "resourceId" integer NOT NULL,
    "userId" integer,
    "startTime" timestamptz NOT NULL,
    "originalEndNotes" text,
    "originalAttributedOperatingDurationInMinutes" double precision,
    "recoveredAt" timestamptz NOT NULL DEFAULT now(),
    "reason" text NOT NULL,
    CONSTRAINT "PK_resource_usage_recovery" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE "password_policy_audit_overflow" (
    "legacyAuditId" integer NOT NULL,
    "metadata" text NOT NULL,
    CONSTRAINT "PK_password_policy_audit_overflow" PRIMARY KEY ("legacyAuditId")
  )`,
  // expiresAt is an epoch in milliseconds: beyond the range of a 32 bit integer.
  `CREATE TABLE "sso_logout_state" (
    "key" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" bigint NOT NULL,
    CONSTRAINT "PK_sso_logout_state" PRIMARY KEY ("key")
  )`,
  `CREATE INDEX "IDX_sso_logout_expiry" ON "sso_logout_state" ("expiresAt")`,
];
