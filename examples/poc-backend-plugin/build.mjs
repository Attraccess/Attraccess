// Real-world build: bundles the plugin with esbuild while externalizing every
// host-shared package so DI token identity is preserved at load time.
import { build } from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));

const HOST_SHARED_EXTERNALS = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  '@attraccess/plugins-backend-sdk',
];

await build({
  entryPoints: [join(HERE, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2021',
  outfile: join(HERE, 'dist/index.js'),
  external: HOST_SHARED_EXTERNALS,
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
});

console.log('Built dist/index.js — host-shared packages externalized, not bundled.');
