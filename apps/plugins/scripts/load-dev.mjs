// Copies a built plugin `package/` dir into the local dev server's plugin dir.
// Usage (cwd = plugin dir): node ../scripts/load-dev.mjs package
// Target: $PLUGIN_DIR, else $STORAGE_ROOT/plugins, else <repo>/storage/plugins.
// The API discovers plugins at boot, so restart `pnpm serve --only=api` afterwards.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.cwd(), process.argv[2] ?? 'package');
const { name } = JSON.parse(readFileSync(join(src, 'plugin.json'), 'utf8'));
const repoRoot = resolve(import.meta.dirname, '../../..');
const pluginDir = process.env.PLUGIN_DIR ?? join(process.env.STORAGE_ROOT ?? join(repoRoot, 'storage'), 'plugins');
const target = join(pluginDir, name);

mkdirSync(pluginDir, { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(src, target, { recursive: true });
console.log(`Loaded ${name} -> ${target}\nRestart the API to pick it up.`);
