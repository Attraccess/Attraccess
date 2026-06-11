// Shared backend bundler for Attraccess plugin nx apps.
//
// Bundles a plugin's backend entry into a single CommonJS file while
// externalizing every host-shared package so dependency-injection token
// identity is preserved at load time. A bundled copy of any of these is treated
// as a *different* type by the host and silently fails to connect — see
// docs/en/plugins/developing-plugins.md ("Packaging the backend").
//
// One or more --entry/--outfile pairs may be passed (paired positionally), so a
// plugin can bundle its backend and its migrations entry in a single invocation
// without each clobbering the other's output dir. Examples:
//   node ../scripts/esbuild-backend.mjs --entry backend/plugin.ts --outfile package/dist/index.js
//   node ../scripts/esbuild-backend.mjs \
//     --entry backend/plugin.ts     --outfile package/dist/index.js \
//     --entry backend/migrations.ts --outfile package/dist/migrations.js
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { parseArgs } from 'node:util';

const HOST_SHARED_EXTERNALS = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  '@attraccess/plugins-backend-sdk',
];

const { values } = parseArgs({
  options: {
    entry: { type: 'string', multiple: true },
    outfile: { type: 'string', multiple: true },
  },
});

const entries = values.entry ?? [];
const outfiles = values.outfile ?? [];

if (entries.length === 0 || entries.length !== outfiles.length) {
  console.error('usage: esbuild-backend.mjs --entry <file> --outfile <file> [--entry <file> --outfile <file> ...]');
  process.exit(1);
}

const pairs = entries.map((entry, index) => ({
  entry: resolve(process.cwd(), entry),
  outfile: resolve(process.cwd(), outfiles[index]),
  label: outfiles[index],
}));

// Clean each distinct output dir once, up front, so building a later entry can
// never wipe an earlier entry that shares the same dir (e.g. index.js +
// migrations.js both in package/dist). A sibling frontend build is untouched.
const outDirs = [...new Set(pairs.map(({ outfile }) => dirname(outfile)))];
for (const dir of outDirs) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

for (const { entry, outfile } of pairs) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2021',
    outfile,
    external: HOST_SHARED_EXTERNALS,
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
    logLevel: 'info',
  });
}

console.log(`Built ${pairs.map(({ label }) => label).join(', ')} — host-shared packages externalized, not bundled.`);
