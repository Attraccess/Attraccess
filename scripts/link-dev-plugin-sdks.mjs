#!/usr/bin/env node
// Links built workspace libs into node_modules so externally loaded plugin
// backends can require host-shared packages at runtime (e.g.
// @attraccess/plugins-backend-sdk). Plugin artifacts externalize these; the
// host's plugin-loader routes bare specifiers to node_modules — see
// apps/api/src/plugin-system/plugin-loader.ts.
//
// Usage: node scripts/link-dev-plugin-sdks.mjs
// Run after: pnpm nx build plugins-backend-sdk database-entities
import { existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scopeDir = join(repoRoot, 'node_modules/@attraccess');

const packages = [
  { name: 'plugins-backend-sdk', out: 'dist/libs/plugins-backend-sdk' },
  { name: 'database-entities', out: 'dist/libs/database-entities' },
];

let failed = false;
mkdirSync(scopeDir, { recursive: true });

for (const pkg of packages) {
  const src = join(repoRoot, pkg.out);
  const linkPath = join(scopeDir, pkg.name);
  if (!existsSync(src)) {
    console.error(`Build output missing: ${src}`);
    console.error(`Run: pnpm nx build ${pkg.name.replace(/-.*/, (m) => m) || pkg.name}`);
    failed = true;
    continue;
  }
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(src, linkPath, 'dir');
  console.log(`Linked ${linkPath} -> ${src}`);
}

if (failed) {
  console.error('\nRun: pnpm nx build plugins-backend-sdk database-entities');
  process.exit(1);
}
