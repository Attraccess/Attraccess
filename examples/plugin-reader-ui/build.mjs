// Builds ./package/ (dist/index.js plus package.json) ready for npm pack.
import { build as esbuild } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, 'package');

// Host-shared packages must never be bundled: they carry the DI identities of the host.
const HOST_SHARED_EXTERNALS = ['@nestjs/common', '@nestjs/core', 'reflect-metadata', '@attraccess/plugins-backend-sdk'];

rmSync(PACKAGE, { recursive: true, force: true });
mkdirSync(join(PACKAGE, 'dist'), { recursive: true });

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

cpSync(join(HERE, 'package.json'), join(PACKAGE, 'package.json'));
