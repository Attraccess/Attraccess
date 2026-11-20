// Plain CommonJS on purpose: webpack.config.migrations.js loads it before any TypeScript is compiled.
// One released migration track per database backend, selected by DATABASE_TYPE. A second backend adds its
// track directory here, its MigrationTrack in database/<backend>/ and its entry in resolveDatabaseBackend; a
// test (migration-tracks.spec.ts) keeps this list in step with the backends.
const DEFAULT_DATABASE_TYPE = 'postgres';
const MIGRATION_TRACK_DIRECTORIES = {
  postgres: 'apps/api/src/database/postgres/migrations',
};

/** Only a plain identifier is echoed: a misplaced connection string must not reach build logs. */
function describe(value) {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? `"${value}"` : '(redacted: not a database type name)';
}

/** Throws before any build or migration work when DATABASE_TYPE is not supported. */
function resolveMigrationTrack(env = process.env) {
  const raw = env.DATABASE_TYPE?.trim();
  const type = raw ? raw.toLowerCase() : DEFAULT_DATABASE_TYPE;
  if (!Object.hasOwn(MIGRATION_TRACK_DIRECTORIES, type)) {
    throw new Error(
      `Unsupported DATABASE_TYPE ${describe(raw)}. Supported values: ${Object.keys(MIGRATION_TRACK_DIRECTORIES).join(', ')}.`,
    );
  }
  return { type, directory: MIGRATION_TRACK_DIRECTORIES[type] };
}

module.exports = { DEFAULT_DATABASE_TYPE, MIGRATION_TRACK_DIRECTORIES, resolveMigrationTrack };
