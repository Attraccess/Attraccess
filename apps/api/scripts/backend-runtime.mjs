import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

/** Use the same bundled backend registry as migrations without starting the API. */
export function loadDatabaseTooling() {
  const entry = fileURLToPath(new URL('../../../dist/apps/migrations/tooling.js', import.meta.url));
  if (!existsSync(entry))
    throw new Error('Database tooling bundle is missing. Run pnpm nx run api:build-migration-datasource.');
  return require(entry);
}
