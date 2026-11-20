import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Plugin SDK 2.0 has no TypeORM entities or repositories: the service talks to the record port (`context.storage`) that
// the harness fakes in memory. A base revision that still persists through SDK-root decorators, the `/sqlite` subpath or
// `context.persistence` repositories cannot load against the SDK or the harness of the revision under test.
const legacyDecoratorNames = /\b(?:PrimaryGeneratedColumn|PrimaryColumn|Entity|Column)\b/;
const sqliteSubpathImport = /from\s*'@attraccess\/plugins-backend-sdk\/sqlite'/;
const sdkRootImports = /import\s*\{[^}]*\}\s*from\s*'@attraccess\/plugins-backend-sdk'/g;

/** Whether one TypeScript source imports the `/sqlite` subpath or a TypeORM decorator from the SDK root. */
export function importsLegacySdkPersistence(source) {
  if (sqliteSubpathImport.test(source)) return true;
  return (source.match(sdkRootImports) ?? []).some((statement) => legacyDecoratorNames.test(statement));
}

/** Whether the backend directory of a revision has not been ported to the record port yet. */
export async function usesLegacySdkPersistence(directory) {
  if (!existsSync(join(directory, 'storage/index.ts'))) return true;
  const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.ts'));
  for (const file of files) {
    if (importsLegacySdkPersistence(await readFile(join(directory, file), 'utf8'))) return true;
  }
  return false;
}
