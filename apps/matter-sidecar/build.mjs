import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('apps/matter-sidecar/package.json', 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await build({
  entryPoints: ['apps/matter-sidecar/src/main.ts'],
  outfile: 'dist/apps/matter-sidecar/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@matter/*', 'ws'],
  define: { BUILD_REVISION: JSON.stringify(revision), BUILD_VERSION: JSON.stringify(pkg.version) },
  sourcemap: true,
});
mkdirSync('dist/apps/matter-sidecar', { recursive: true });
writeFileSync('dist/apps/matter-sidecar/package.json', JSON.stringify(pkg, null, 2) + '\n');
