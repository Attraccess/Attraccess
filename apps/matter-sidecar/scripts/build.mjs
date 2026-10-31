// Bundles the sidecar into dist/apps/matter-sidecar/main.js. matter.js stays external and is resolved from
// node_modules at run time so the loaded version is the pinned one. The Git revision is stamped at build time
// (the Nx build target lists `git rev-parse HEAD` as an input, so a cached build never reports an old revision).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'dist/apps/matter-sidecar');

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [resolve(root, 'apps/matter-sidecar/src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: resolve(outDir, 'main.js'),
  external: ['@matter/*'],
  tsconfig: resolve(root, 'apps/matter-sidecar/tsconfig.app.json'),
  define: { __BUILD_COMMIT__: JSON.stringify(gitCommit()) },
  sourcemap: true,
  logLevel: 'info',
});
