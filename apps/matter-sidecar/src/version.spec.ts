import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPATIBILITY_TABLE, STORAGE_SCHEMA_VERSION, WIRE_VERSION } from '@attraccess/matter-contract';
import { SIDECAR_VERSION, buildCommit, loadedMatterJsVersion, versionInfo } from './version';

const root = join(__dirname, '../../..');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('version metadata', () => {
  // Loading matter.js itself needs native Node module loading, so the built-process test covers that. Jest only
  // resolves the installed package here.
  it('reads the resolved matter.js release and fails when it drifts from the pin or the table', () => {
    const version = loadedMatterJsVersion();
    expect(version).toBe(rootPackage.dependencies['@matter/main']);
    expect(version).toBe(rootPackage.dependencies['@matter/nodejs']);
    expect(version).toBe(COMPATIBILITY_TABLE[0].matterJs);
  });

  it('keeps the sidecar release equal to package.json and the compatibility table', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    expect(SIDECAR_VERSION).toBe(manifest.version);
    expect(COMPATIBILITY_TABLE[0].sidecar).toBe(manifest.version);
  });

  it('builds the version report', () => {
    const info = versionInfo('0.18.0', 'abcdef0123456789abcdef');
    expect(info).toEqual({
      build: { version: `${SIDECAR_VERSION}+abcdef012345`, commit: 'abcdef0123456789abcdef' },
      sidecar: SIDECAR_VERSION,
      matterJs: '0.18.0',
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      wireVersion: WIRE_VERSION,
    });
    expect(buildCommit()).toBe('unknown');
  });

  it('fails clearly when matter.js cannot be located', () => {
    expect(() => loadedMatterJsVersion(() => '/nonexistent/dir/index.js')).toThrow('Could not determine');
  });
});
