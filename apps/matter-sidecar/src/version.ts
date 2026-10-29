import { STORAGE_SCHEMA_VERSION, WIRE_VERSION } from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pkg from '../package.json';

declare const __BUILD_COMMIT__: string | undefined;

export const SIDECAR_VERSION: string = pkg.version;

export function buildCommit(): string {
  return typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown';
}

/** Reads the version of the matter.js package that was actually resolved, not a configured one. */
export function loadedMatterJsVersion(resolveEntry: () => string = () => require.resolve('@matter/main')): string {
  let directory = dirname(resolveEntry());
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === '@matter/main' && manifest.version) return manifest.version;
    } catch {
      // keep walking up
    }
    directory = dirname(directory);
  }
  throw new Error('Could not determine the loaded matter.js version');
}

export type VersionInfo = {
  build: { version: string; commit: string };
  sidecar: string;
  matterJs: string;
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  wireVersion: typeof WIRE_VERSION;
};

export function versionInfo(matterJs: string, commit = buildCommit()): VersionInfo {
  return {
    build: { version: `${SIDECAR_VERSION}+${commit.slice(0, 12)}`, commit },
    sidecar: SIDECAR_VERSION,
    matterJs,
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    wireVersion: WIRE_VERSION,
  };
}
