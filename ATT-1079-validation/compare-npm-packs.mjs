import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const roots = {
  baseline: 'ATT-1079-validation/npm-baseline/package',
  current: 'ATT-1079-validation/npm-current/package',
};
const asset = /(__federation_expose_Plugin|__federation_fn_import|_virtual___federation_fn_import|jsx-runtime|preload-helper|react|rolldown-runtime)-[A-Za-z0-9_-]+\.js/g;
async function files(root, dir = root) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(root, p));
    else out.push(relative(root, p).replaceAll('\\', '/'));
  }
  return out.sort();
}
function normalize(text) {
  return text
    .replace(/(?:\.\.\/)*(?:attraccess\/)?node_modules\/\.pnpm\//g, '<node_modules>/.pnpm/')
    .replace(asset, '$1-<content-hash>.js');
}
const [baseFiles, currentFiles] = await Promise.all([files(roots.baseline), files(roots.current)]);
const normalizePath = p => p.replace(asset, '$1-<content-hash>.js');
const baselineByPath = new Map(baseFiles.map(p => [normalizePath(p), p]));
const currentByPath = new Map(currentFiles.map(p => [normalizePath(p), p]));
const keys = [...new Set([...baselineByPath.keys(), ...currentByPath.keys()])].sort();
const diffs = [];
for (const key of keys) {
  const b = baselineByPath.get(key), c = currentByPath.get(key);
  if (!b || !c) { diffs.push({ path: key, baseline: b ?? null, current: c ?? null }); continue; }
  const [bb, cb] = await Promise.all([readFile(join(roots.baseline, b)), readFile(join(roots.current, c))]);
  const btxt = normalize(bb.toString()), ctxt = normalize(cb.toString());
  if (btxt !== ctxt) diffs.push({ path: key, baselineSha256: createHash('sha256').update(btxt).digest('hex'), currentSha256: createHash('sha256').update(ctxt).digest('hex'), baselineBytes: bb.length, currentBytes: cb.length });
}
const inventory = {};
for (const [name, root, list] of [['baseline', roots.baseline, baseFiles], ['current', roots.current, currentFiles]]) {
  let bytes = 0;
  const records = [];
  for (const p of list) {
    const b = await readFile(join(root, p)); bytes += b.length;
    records.push({ path: p, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') });
  }
  inventory[name] = { files: list.length, unpackedBytes: bytes, records };
}
console.log(JSON.stringify({ pathNormalization: 'node_modules symlink roots and generated Vite content-hash filenames only', inventories: inventory, normalizedContentEquivalent: diffs.length === 0, differences: diffs }, null, 2));
