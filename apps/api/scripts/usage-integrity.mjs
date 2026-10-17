import { loadDatabaseTooling } from './backend-runtime.mjs';

/** Validate an import through the selected provider. SQL and engine handles stay in its implementation. */
export async function assertUsageIntegrity(database) {
  return loadDatabaseTooling().checkUsageIntegrity(database);
}
