/**
 * Database-level guarantees of the schema, as PostgreSQL functions and triggers. They are the equivalents of the
 * SQLite triggers of the released track: billing balance maintenance, usage integrity and audit immutability.
 * Names are unqualified: the connection's search_path (DATABASE_SCHEMA) decides where they live.
 */

const PUBLISHED = (alias: string) =>
  `${alias}."endTime" IS NULL AND ${alias}."usageAction" = 'usage' AND ${alias}."isFinalized" = true AND ${alias}."lifecyclePending" = false`;

export const TRIGGER_STATEMENTS: readonly string[] = [
  // Audit rows are immutable.
  `CREATE FUNCTION "audit_log_no_update_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit rows are immutable' USING ERRCODE = 'integrity_constraint_violation';
END;
$$`,
  `CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_no_update_fn"()`,

  // An open usage must be finalized or lifecycle-pending.
  `CREATE FUNCTION "resource_usage_valid_open_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."endTime" IS NULL AND NEW."isFinalized" = false AND NEW."lifecyclePending" = false THEN
    RAISE EXCEPTION 'Open usage must be finalized or lifecycle-pending' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$`,
  `CREATE TRIGGER "resource_usage_valid_open_insert" BEFORE INSERT ON "resource_usage"
  FOR EACH ROW EXECUTE FUNCTION "resource_usage_valid_open_fn"()`,
  `CREATE TRIGGER "resource_usage_valid_open_update" BEFORE UPDATE ON "resource_usage"
  FOR EACH ROW EXECUTE FUNCTION "resource_usage_valid_open_fn"()`,

  // At most one published session per (resource, user). Legacy duplicates stay readable (the check only runs for
  // the row being written). The per-resource advisory lock makes the check race free under READ COMMITTED: a
  // concurrent writer waits for the first to commit and then sees its row.
  `CREATE FUNCTION "resource_usage_single_active_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (${PUBLISHED('NEW')}) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (${PUBLISHED('OLD')}) AND OLD."resourceId" = NEW."resourceId"
     AND OLD."userId" IS NOT DISTINCT FROM NEW."userId" THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('resource_usage_single_active'), NEW."resourceId");
  IF EXISTS (
    SELECT 1 FROM "resource_usage" other
    WHERE other."resourceId" = NEW."resourceId" AND other."userId" IS NOT DISTINCT FROM NEW."userId"
      AND other."id" <> NEW."id" AND ${PUBLISHED('other')}
  ) THEN
    RAISE EXCEPTION 'User already has an active usage session on this resource'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$`,
  `CREATE TRIGGER "resource_usage_single_active_per_user_insert" AFTER INSERT ON "resource_usage"
  FOR EACH ROW EXECUTE FUNCTION "resource_usage_single_active_fn"()`,
  `CREATE TRIGGER "resource_usage_single_active_per_user_update" AFTER UPDATE ON "resource_usage"
  FOR EACH ROW EXECUTE FUNCTION "resource_usage_single_active_fn"()`,

  // The user's credit balance follows the completed billing transactions. Row level UPDATEs of "user" take the
  // row lock, so concurrent postings add up instead of overwriting each other.
  `CREATE FUNCTION "billing_transaction_balance_fn"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'completed' THEN
      UPDATE "user" SET "creditBalance" = "creditBalance" + NEW."amount", "updatedAt" = now() WHERE "id" = NEW."userId";
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'completed' THEN
      UPDATE "user" SET "creditBalance" = "creditBalance" - OLD."amount", "updatedAt" = now() WHERE "id" = OLD."userId";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."userId" IS DISTINCT FROM NEW."userId" OR OLD."amount" IS DISTINCT FROM NEW."amount"
     OR OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF OLD."status" = 'completed' THEN
      UPDATE "user" SET "creditBalance" = "creditBalance" - OLD."amount", "updatedAt" = now() WHERE "id" = OLD."userId";
    END IF;
    IF NEW."status" = 'completed' THEN
      UPDATE "user" SET "creditBalance" = "creditBalance" + NEW."amount", "updatedAt" = now() WHERE "id" = NEW."userId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$`,
  `CREATE TRIGGER "trg_billing_transaction_balance_after_insert" AFTER INSERT ON "billing_transaction"
  FOR EACH ROW EXECUTE FUNCTION "billing_transaction_balance_fn"()`,
  `CREATE TRIGGER "trg_billing_transaction_balance_after_update" AFTER UPDATE ON "billing_transaction"
  FOR EACH ROW EXECUTE FUNCTION "billing_transaction_balance_fn"()`,
  `CREATE TRIGGER "trg_billing_transaction_balance_after_delete" AFTER DELETE ON "billing_transaction"
  FOR EACH ROW EXECUTE FUNCTION "billing_transaction_balance_fn"()`,
];

/** The triggers that maintain derived data. A data import disables them so balances are not applied twice. */
export const DERIVED_DATA_TRIGGERS: ReadonlyArray<{ table: string; trigger: string }> = [
  { table: 'billing_transaction', trigger: 'trg_billing_transaction_balance_after_insert' },
  { table: 'billing_transaction', trigger: 'trg_billing_transaction_balance_after_update' },
  { table: 'billing_transaction', trigger: 'trg_billing_transaction_balance_after_delete' },
];
