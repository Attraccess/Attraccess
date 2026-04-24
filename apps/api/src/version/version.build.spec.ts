import * as fs from 'fs';
import * as path from 'path';

interface PackageJsonLike {
  version?: string;
}

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const VERSIONED_PACKAGE_PATHS = [
  'package.json',
  'apps/api/package.json',
  'apps/frontend/package.json',
  'libs/api-client/package.json',
  'libs/database-entities/package.json',
  'libs/env/package.json',
  'libs/plugins-backend-sdk/package.json',
  'libs/plugins-frontend-sdk/package.json',
  'libs/plugins-frontend-ui/package.json',
  'libs/react-query-client/package.json',
];

function readVersion(relativePath: string): { version: string; absPath: string } {
  const absPath = path.join(WORKSPACE_ROOT, relativePath);
  const raw = fs.readFileSync(absPath, 'utf8');
  const parsed = JSON.parse(raw) as PackageJsonLike;
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`package.json at ${relativePath} is missing a "version" field`);
  }
  return { version: parsed.version, absPath };
}

describe('package.json version drift guard', () => {
  it('every versioned package.json exists and has a non-empty version', () => {
    for (const relativePath of VERSIONED_PACKAGE_PATHS) {
      const absPath = path.join(WORKSPACE_ROOT, relativePath);
      expect(fs.existsSync(absPath)).toBe(true);
      const { version } = readVersion(relativePath);
      expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    }
  });

  it('all app + lib + root package.json files share the same version', () => {
    const versions = VERSIONED_PACKAGE_PATHS.map((relativePath) => ({
      path: relativePath,
      ...readVersion(relativePath),
    }));

    const distinct = new Set(versions.map((v) => v.version));

    if (distinct.size > 1) {
      const summary = versions.map((v) => `  ${v.path}: ${v.version}`).join('\n');
      throw new Error(
        `package.json versions are out of sync. nx release must bump them in lockstep.\n${summary}`,
      );
    }

    expect(distinct.size).toBe(1);
  });
});
