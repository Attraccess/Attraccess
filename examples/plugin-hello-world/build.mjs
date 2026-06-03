// One-command build for the Hello World example plugin.
//
// Produces a ./package/ directory laid out exactly as the host expects inside
// the uploaded ZIP, then zips it to ./plugin-hello-world.zip:
//
//   plugin-hello-world.zip
//   ├── plugin.json
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
import { spawnSync } from 'child_process';

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
rmSync(join(HERE, 'plugin-hello-world.zip'), { force: true });
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
await viteBuild({
  root: join(HERE, 'frontend'),
  configFile: join(HERE, 'frontend/vite.config.ts'),
  build: { outDir: join(PACKAGE, 'frontend'), emptyOutDir: true },
  logLevel: 'info',
});

// 3. Manifest at the package root.
cpSync(join(HERE, 'plugin.json'), join(PACKAGE, 'plugin.json'));

// 4. ZIP the package contents (not the package/ folder itself) for upload.
const zip = spawnSync('zip', ['-r', join(HERE, 'plugin-hello-world.zip'), '.'], {
  cwd: PACKAGE,
  stdio: 'inherit',
});
if (zip.status !== 0) {
  console.warn(
    '\n`zip` CLI not available — the ./package directory is ready; zip its *contents* manually:\n' +
      '  cd package && zip -r ../plugin-hello-world.zip .'
  );
} else {
  console.log('\nBuilt plugin-hello-world.zip — upload it on the Plugins admin page.');
}
