// Maps the tsconfig.base.json path aliases to their sources, as nxViteTsPaths did before Nx 24. Vite's native
// resolve.tsconfigPaths only applies to imports from files whose own tsconfig chain declares the paths, so it misses
// module federation's bare `shared` entries and plugin frontends, whose tsconfigs do not extend the base.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Alias } from 'vite';

const root = join(__dirname, '../..');

export function workspaceAliases(): Alias[] {
  const { paths } = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8')).compilerOptions as {
    paths: Record<string, string[]>;
  };
  return Object.entries(paths).map(([find, [target]]) => ({
    find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`),
    replacement: join(root, target),
  }));
}
