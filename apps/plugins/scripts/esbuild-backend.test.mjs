import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bundler = resolve('apps/plugins/scripts/esbuild-backend.mjs');
for (const configured of [false, true])
  test(`backend bundling preserves default externals with tsconfig=${configured}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'matter-bundler-'));
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src/shared.ts'), 'export const value = 42;');
      writeFileSync(
        join(root, 'src/plugin.ts'),
        `import { value } from '${configured ? '@fixture/shared' : './shared'}'; import { Injectable } from '@nestjs/common'; @Injectable() class Service {} export { value, Service };`,
      );
      writeFileSync(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            baseUrl: '.',
            paths: { '@fixture/shared': ['src/shared.ts'] },
          },
        }),
      );
      execFileSync(
        process.execPath,
        [
          bundler,
          '--entry',
          'src/plugin.ts',
          '--outfile',
          'dist/index.js',
          ...(configured ? ['--tsconfig', 'tsconfig.json'] : []),
        ],
        { cwd: root, stdio: 'pipe' },
      );
      const source = readFileSync(join(root, 'dist/index.js'), 'utf8');
      assert.match(source, /require\("@nestjs\/common"\)/);
      assert.doesNotMatch(source, /require\("@fixture\/shared"\)/);
      assert.match(source, /value = 42/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
