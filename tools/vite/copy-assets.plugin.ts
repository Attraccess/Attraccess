// Copies static files into a Vite library build. Replaces nxCopyAssetsPlugin, which Nx 24 turned into a no-op.
import { cpSync, globSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** A glob relative to the Vite root, or a glob inside `input` copied to `output` (relative to the build output). */
export type CopyAsset = string | { input: string; glob: string; output: string };

export function copyAssets(assets: CopyAsset[]): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'attraccess:copy-assets',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      for (const asset of assets) {
        const { input, glob, output } = typeof asset === 'string' ? { input: '.', glob: asset, output: '.' } : asset;
        const cwd = resolve(config.root, input);
        for (const file of globSync(glob, { cwd })) {
          const target = join(outDir, output, file);
          mkdirSync(dirname(target), { recursive: true });
          cpSync(join(cwd, file), target);
        }
      }
    },
  };
}
