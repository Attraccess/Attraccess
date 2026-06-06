// Shared backend bundler for Attraccess plugin nx apps.
//
// Bundles a plugin's backend entry into a single CommonJS file while
// externalizing every host-shared package so dependency-injection token
// identity is preserved at load time. A bundled copy of any of these is treated
// as a *different* type by the host and silently fails to connect — see
// docs/en/plugins/developing-plugins.md ("Packaging the backend").
//
// Usage: node ../scripts/esbuild-backend.mjs --entry backend/plugin.ts --outfile package/dist/index.js
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
    entry: { type: 'string' },
    outfile: { type: 'string' },
  },
});

if (!values.entry || !values.outfile) {
  console.error('usage: esbuild-backend.mjs --entry <file> --outfile <file>');
  process.exit(1);
}

const entry = resolve(process.cwd(), values.entry);
const outfile = resolve(process.cwd(), values.outfile);

// Clean only the backend output dir so a sibling frontend build is untouched.
rmSync(dirname(outfile), { recursive: true, force: true });
mkdirSync(dirname(outfile), { recursive: true });

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

console.log(`Built ${values.outfile} — host-shared packages externalized, not bundled.`);
