// Regression test for ATT-496: a shipped plugin entry externalizes
// `@attraccess/plugins-backend-sdk` and so emits a bare
// `require('@attraccess/plugins-backend-sdk')` at runtime. That package is a
// workspace lib bundled INTO the host bundle (dist/apps/api/main.js), not
// installed under node_modules — so in a production image hostRequire cannot
// resolve it on disk and the plugin crashes with
// "Cannot find module '@attraccess/plugins-backend-sdk'".
//
// We reproduce that production-only condition by mocking `module.createRequire`
// so the require it hands the loader throws MODULE_NOT_FOUND for the SDK
// specifier (mirroring the missing on-disk package), while every other
// externalized package still resolves. The loader must serve the SDK from the
// host's already-bundled instance instead of going to disk.

import { build } from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const SDK_SPECIFIER = '@attraccess/plugins-backend-sdk';

// Simulate the production image: the SDK has no resolvable on-disk package, so a
// require produced by createRequire throws MODULE_NOT_FOUND for it. All other
// specifiers resolve normally.
jest.mock('module', () => {
  const actual = jest.requireActual('module');
  return {
    ...actual,
    createRequire: (filename: string) => {
      const real = actual.createRequire(filename);
      const wrapped = (request: string): unknown => {
        if (request === SDK_SPECIFIER) {
          const error = new Error(`Cannot find module '${SDK_SPECIFIER}'`) as Error & { code: string };
          error.code = 'MODULE_NOT_FOUND';
          throw error;
        }
        return real(request);
      };
      wrapped.resolve = real.resolve;
      return wrapped;
    },
  };
});

// Imported after the jest.mock above (which jest hoists). The loader's own
// static `import * as ... from '@attraccess/plugins-backend-sdk'` is resolved by
// Jest's module system, not the mocked createRequire, so it still loads.
import { loadPluginEntryExports } from './plugin-loader';

function findRepoRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('repo root (pnpm-workspace.yaml) not found');
}

const REPO_ROOT = findRepoRoot(__dirname);
const BUILD_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'att-496-plugin-loader');

// Externalize exactly what the real plugin build externalizes, so the artifact
// emits a bare require() for the SDK at runtime.
const EXTERNALS = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  SDK_SPECIFIER,
];

async function buildPluginArtifact(): Promise<string> {
  const entrySrc = join(BUILD_DIR, 'entry.ts');
  const outfile = join(BUILD_DIR, 'dist', 'index.js');

  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });

  // A plugin entry that imports a *value* from the SDK (the Auth decorator),
  // forcing a runtime require('@attraccess/plugins-backend-sdk').
  writeFileSync(
    entrySrc,
    [
      `import { Auth } from '${SDK_SPECIFIER}';`,
      `export default { authType: typeof Auth };`,
      '',
    ].join('\n')
  );

  await build({
    entryPoints: [entrySrc],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2021',
    outfile,
    external: EXTERNALS,
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
    logLevel: 'silent',
  });

  return resolve(outfile);
}

describe('loadPluginEntryExports — host-bundled SDK resolution', () => {
  let artifactPath: string;

  beforeAll(async () => {
    artifactPath = await buildPluginArtifact();
  });

  afterAll(() => {
    rmSync(BUILD_DIR, { recursive: true, force: true });
  });

  it('serves @attraccess/plugins-backend-sdk from the host bundle when it is not resolvable on disk', () => {
    // Before the fix this threw "Cannot find module '@attraccess/plugins-backend-sdk'".
    const exports = loadPluginEntryExports(artifactPath);
    const defaultExport = exports.default as { authType: string };

    expect(defaultExport.authType).toBe('function');
  });
});
