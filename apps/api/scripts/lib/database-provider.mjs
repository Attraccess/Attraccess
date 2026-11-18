// The database provider of the operational scripts (dev seed, re-encryption) and the setup scripts.
//
// Plain Node only: the production image has no TypeScript sources and only ships this folder beside the script, so
// nothing here may import a .ts file. The application reaches its engine through the DatabaseBackend seam
// (apps/api/src/database/backend); these scripts reach theirs through a provider selected by the same DATABASE_TYPE.
// A second backend adds a provider here and one entry in PROVIDERS; a test (database-provider.compat.spec.ts) keeps
// the supported types in step with the seam.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_DATABASE_TYPE = 'sqlite';

/** Only a plain identifier is echoed: a misplaced connection string must not reach logs. */
function describe(value) {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? `"${value}"` : '(redacted: not a database type name)';
}

/**
 * SQLite: one file under the storage root. A handle is an open better-sqlite3 Database. The helpers stay async so callers keep one
 * shape; `run` resolves to `{ lastID, changes }`; `begin({ writeLock: true })` takes the write lock at once so a script never fails half way on a busy database.
 */
export const sqliteProvider = {
  type: 'sqlite',
  /** Same rule as resolveDatabasePath() in apps/api/src/config/storage-path.ts (a test keeps them in step). */
  defaultLocation(env = process.env, cwd = process.cwd()) {
    const storageRoot = resolve(cwd, env.STORAGE_ROOT ?? join(cwd, 'storage'));
    return join(storageRoot, 'attraccess.sqlite');
  },
  async open(location) {
    const { default: Database } = await import('better-sqlite3');
    return new Database(location, { fileMustExist: true, timeout: 5000 });
  },
  async close(db) {
    db.close();
  },
  async run(db, sql, params = []) {
    const { lastInsertRowid, changes } = db.prepare(sql).run(...params);
    return { lastID: Number(lastInsertRowid), changes };
  },
  async get(db, sql, params = []) {
    return db.prepare(sql).get(...params);
  },
  async all(db, sql, params = []) {
    return db.prepare(sql).all(...params);
  },
  async begin(db, { writeLock = false } = {}) {
    db.exec(writeLock ? 'BEGIN IMMEDIATE' : 'BEGIN');
  },
  async commit(db) {
    db.exec('COMMIT');
  },
  async rollback(db) {
    if (db.inTransaction) db.exec('ROLLBACK');
  },
  async hasTable(db, table) {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  },
  async columns(db, table) {
    return db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((row) => row.name);
  },
};

const PROVIDERS = { sqlite: sqliteProvider };
export const SUPPORTED_DATABASE_TYPES = Object.keys(PROVIDERS);

/** Throws before any file or database is touched when DATABASE_TYPE is not supported. */
export function parseDatabaseType(env = process.env) {
  const raw = env.DATABASE_TYPE?.trim();
  if (!raw) return DEFAULT_DATABASE_TYPE;
  const normalized = raw.toLowerCase();
  if (Object.hasOwn(PROVIDERS, normalized)) return normalized;
  throw new Error(
    `Unsupported DATABASE_TYPE ${describe(raw)}. Supported values: ${SUPPORTED_DATABASE_TYPES.join(', ')}.`,
  );
}

export function resolveDatabaseProvider(env = process.env) {
  return PROVIDERS[parseDatabaseType(env)];
}

// Used by the shell setup scripts: `node database-provider.mjs` validates DATABASE_TYPE and prints the type.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${parseDatabaseType(process.env)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
