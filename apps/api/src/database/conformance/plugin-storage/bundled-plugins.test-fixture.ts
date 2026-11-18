import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PluginStorageDefinition } from '@attraccess/plugins-backend-sdk';
import { loadPluginEntryExports } from '../../../plugin-system/runtime/module-loader';

/** What the adoption suite needs from a bundled plugin: its storage declaration and the DDL its 1.x release ran. */
export interface BundledPluginStorage {
  readonly name: string;
  readonly storage: PluginStorageDefinition;
  /** The CREATE/ALTER statements of every 1.x TypeORM migration, in the order they ran. */
  readonly legacySql: readonly string[];
  /** Legacy constraints the neutral schema cannot express (only Matter has some). */
  readonly legacyOnly?: {
    readonly partialUniqueIndexes?: readonly string[];
    readonly columnTypeDeviations?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  };
}

/**
 * Re-exports of each plugin's own modules. The plugins are separate Nx projects the API may not import, so the suite
 * bundles these files the way a plugin build does (the SDK left external) and loads the bundle with the host's
 * plugin loader. `legacySql` is the plugin's test fixture of its deleted TypeORM migrations.
 */
const ENTRIES: Record<string, string> = {
  wago: `export { wagoStorage as storage } from './apps/plugins/wago/backend/storage/index';
    export { WAGO_LEGACY_MIGRATION_SQL as legacySql } from './apps/plugins/wago/backend/storage/legacy-layout.fixture';`,
  matter: `export { MATTER_STORAGE as storage, LEGACY_ONLY_CONSTRAINTS as legacyOnly } from './apps/plugins/matter/backend/plugin-storage/tables';
    export { LEGACY_UP_STATEMENTS as legacySql } from './apps/plugins/matter/backend/testing/legacy-migrations.fixture';`,
  reservations: `export { reservationsStorage as storage } from './apps/plugins/reservations/backend/storage/index';
    export { RESERVATIONS_LEGACY_DDL as legacySql } from './apps/plugins/reservations/backend/testing/legacy-ddl.fixture';`,
  shelly: `export { shellyStorage as storage } from './apps/plugins/shelly/backend/devices/registry/storage';
    export { SHELLY_LEGACY_DDL as legacySql } from './apps/plugins/shelly/backend/testing/legacy-ddl.fixture';`,
};

export const BUNDLED_PLUGINS = Object.keys(ENTRIES);

function repoRoot(start: string): string {
  let directory = start;
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    if (directory === dirname(directory)) throw new Error('repo root (pnpm-workspace.yaml) not found');
    directory = dirname(directory);
  }
  return directory;
}

/** WAGO keys its fixture by migration (`[name, statements][]`); the others list the statements. */
function flatten(legacySql: readonly unknown[]): string[] {
  return legacySql.flatMap((entry) => (Array.isArray(entry) ? (entry[1] as string[]) : [entry as string]));
}

/** Bundles and loads the storage declarations of every bundled plugin with storage. */
export async function loadBundledPlugins(): Promise<BundledPluginStorage[]> {
  const root = repoRoot(__dirname);
  const directory = await mkdtemp(join(tmpdir(), 'bundled-plugin-storage-'));
  try {
    const loaded: BundledPluginStorage[] = [];
    for (const [name, contents] of Object.entries(ENTRIES)) {
      const outfile = join(directory, `${name}.cjs`);
      await build({
        stdin: { contents, resolveDir: root, loader: 'ts', sourcefile: `${name}-storage.ts` },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'es2021',
        packages: 'external',
        outfile,
        logLevel: 'silent',
      });
      const exports = loadPluginEntryExports(outfile) as unknown as Omit<BundledPluginStorage, 'name'>;
      loaded.push({ ...exports, name, legacySql: flatten(exports.legacySql) });
    }
    return loaded;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
