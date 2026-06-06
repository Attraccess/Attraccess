// Zips an already-built plugin `package/` directory into an uploadable ZIP.
//
// The ZIP must contain the package *contents* (plugin.json at the root, plus
// dist/ and/or frontend/), NOT the containing folder — the host expects
// plugin.json at the ZIP root.
//
// Usage: node ../scripts/zip-plugin.mjs --src package --out dist/plugin-<name>.zip
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    src: { type: 'string' },
    out: { type: 'string' },
  },
});

if (!values.src || !values.out) {
  console.error('usage: zip-plugin.mjs --src <package-dir> --out <zip-path>');
  process.exit(1);
}

const src = resolve(process.cwd(), values.src);
const out = resolve(process.cwd(), values.out);

if (!existsSync(src)) {
  console.error(`source directory not found: ${values.src} — run the build targets first.`);
  process.exit(1);
}

rmSync(out, { force: true });
mkdirSync(dirname(out), { recursive: true });

// Zip the contents of `src` (cwd = src, pattern '.') so plugin.json lands at the ZIP root.
const zip = spawnSync('zip', ['-r', out, '.'], { cwd: src, stdio: 'inherit' });
if (zip.status !== 0) {
  console.error('`zip` CLI failed or is unavailable.');
  process.exit(zip.status ?? 1);
}

console.log(`Built ${values.out}`);
