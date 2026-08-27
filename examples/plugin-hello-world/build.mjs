// One-command build for the Hello World example plugin.
//
// Produces a ./package/ directory ready for npm pack:
//
//   package/
//   ├── package.json
//   ├── dist/index.js          (backend, CommonJS)
//   └── frontend/              (frontend module-federation remote)
//       ├── remoteEntry.js
//       └── ...chunks
//
// Run with:  node build.mjs   (or `npm run build`)
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, 'package');

// Host-shared packages must NEVER be bundled into the backend artifact: they
// carry the dependency-injection identities, the shared event bus and the
// single database connection. A bundled copy is treated as a *different* type
// and silently fails to connect. The SDK itself is safe to bundle.
const HOST_SHARED_EXTERNALS = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  '@attraccess/plugins-backend-sdk',
];

rmSync(PACKAGE, { recursive: true, force: true });
mkdirSync(join(PACKAGE, 'dist'), { recursive: true });

// 1. Backend — single CommonJS bundle with host-shared packages externalized.
await esbuild({
  entryPoints: [join(HERE, 'backend/plugin.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2021',
  outfile: join(PACKAGE, 'dist/index.js'),
  external: HOST_SHARED_EXTERNALS,
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
  logLevel: 'info',
});

// 2. Frontend — Vite module federation remote exposing `./plugin`.
// `@originjs/vite-plugin-federation` resolves the `exposes` paths relative to
// process.cwd(), not the Vite `root`, so building from anywhere but frontend/
// fails to find `./src/plugin.tsx`. chdir into frontend/ around the build so the
// documented `npm run build` works regardless of where it is invoked from.
const cwdBeforeBuild = process.cwd();
process.chdir(join(HERE, 'frontend'));
try {
  await viteBuild({
    root: join(HERE, 'frontend'),
    configFile: join(HERE, 'frontend/vite.config.ts'),
    build: { outDir: join(PACKAGE, 'frontend'), emptyOutDir: true },
    logLevel: 'info',
  });
} finally {
  process.chdir(cwdBeforeBuild);
}

// 3. npm metadata at the package root. npm pack excludes source and dev files
// through the package's files allowlist.
cpSync(join(HERE, 'package.json'), join(PACKAGE, 'package.json'));
