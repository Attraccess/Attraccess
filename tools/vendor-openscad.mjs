#!/usr/bin/env node
// Vendors OpenSCAD (wasm) and Liberation Sans into apps/frontend/public/openscad/.
// Run manually; the output is committed. Not part of the build.
//
//   node tools/vendor-openscad.mjs
//
// Why this exists: the openscad-wasm npm package inlines a 10.3 MB wasm module as
// base64 inside a 13.9 MB JS file, and ships no fonts. We extract the real .wasm so
// the browser can stream-compile and cache it, and we bundle one font because
// OpenSCAD's text() needs fontconfig to find something.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENSCAD_WASM_VERSION = '0.0.4';
const LIBERATION_VERSION = '2.1.5';
const LIBERATION_URL =
  'https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz';
const OPENSCAD_COPYING_URL = 'https://raw.githubusercontent.com/openscad/openscad/master/COPYING';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/frontend/public/openscad');
const fontDir = join(outDir, 'fonts');
const tmp = mkdtempSync(join(tmpdir(), 'vendor-openscad-'));

mkdirSync(fontDir, { recursive: true });

try {
  // --- OpenSCAD wasm -------------------------------------------------------
  console.log(`Fetching openscad-wasm@${OPENSCAD_WASM_VERSION}...`);
  execFileSync('npm', ['pack', `openscad-wasm@${OPENSCAD_WASM_VERSION}`, '--pack-destination', tmp], {
    stdio: 'inherit',
  });
  execFileSync('tar', ['xzf', join(tmp, `openscad-wasm-${OPENSCAD_WASM_VERSION}.tgz`), '-C', tmp]);

  const src = readFileSync(join(tmp, 'package/openscad.js'), 'utf8');

  // The wasm arrives as the third argument of the loader call.
  const call = /_loadWasmModule\(\s*0\s*,\s*null\s*,\s*'([A-Za-z0-9+/=]+)'/.exec(src);
  if (!call) throw new Error('Could not find the inlined wasm payload — upstream packaging changed.');

  const wasm = Buffer.from(call[1], 'base64');
  if (wasm.subarray(0, 4).toString('binary') !== '\0asm') {
    throw new Error('Extracted payload is not a WebAssembly module.');
  }
  writeFileSync(join(outDir, 'openscad.wasm'), wasm);
  console.log(`  openscad.wasm  ${(wasm.length / 1e6).toFixed(1)} MB`);

  // Replace the loader (everything before `function wasm(`) with one that fetches the
  // external .wasm and caches the compiled module, so repeated renders don't recompile.
  const bodyStart = src.indexOf('\nfunction wasm(');
  if (bodyStart < 0) throw new Error('Could not find the wasm() entry point — upstream packaging changed.');

  const patchedLoader = `// MODIFIED by tools/vendor-openscad.mjs (Attraccess).
// Upstream inlined the wasm as base64 and recompiled it on every instance. This
// version loads an external openscad.wasm and caches the compiled module.
// Only this loader was changed; OpenSCAD itself is unmodified. See NOTICE.md.
let __wasmModulePromise = null;
function _loadWasmModule() {
  if (!__wasmModulePromise) {
    const url = new URL('./openscad.wasm', import.meta.url);
    __wasmModulePromise =
      typeof process !== 'undefined' && process.versions != null && process.versions.node != null
        ? Promise.all([import('node:fs/promises'), import('node:url')]).then(([fs, u]) =>
            fs.readFile(u.fileURLToPath(url)).then((b) => WebAssembly.compile(b))
          )
        : WebAssembly.compileStreaming(fetch(url));
  }
  return __wasmModulePromise;
}
`;

  const patched = (patchedLoader + src.slice(bodyStart)).replace(
    /_loadWasmModule\(\s*0\s*,\s*null\s*,\s*'[A-Za-z0-9+/=]+'\s*,?\s*/,
    '_loadWasmModule('
  );
  writeFileSync(join(outDir, 'openscad.js'), patched);
  console.log(`  openscad.js    ${(patched.length / 1e3).toFixed(0)} KB`);

  // --- Licence texts -------------------------------------------------------
  const copying = await fetch(OPENSCAD_COPYING_URL).then((r) => {
    if (!r.ok) throw new Error(`COPYING fetch failed: ${r.status}`);
    return r.text();
  });
  writeFileSync(join(outDir, 'COPYING'), copying);

  // --- Liberation Sans -----------------------------------------------------
  console.log(`Fetching Liberation Fonts ${LIBERATION_VERSION}...`);
  const tarPath = join(tmp, 'liberation.tar.gz');
  const tar = Buffer.from(await fetch(LIBERATION_URL).then((r) => {
    if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
    return r.arrayBuffer();
  }));
  writeFileSync(tarPath, tar);
  execFileSync('tar', ['xzf', tarPath, '-C', tmp]);

  const fontSrc = join(tmp, `liberation-fonts-ttf-${LIBERATION_VERSION}`);
  copyFileSync(join(fontSrc, 'LiberationSans-Regular.ttf'), join(fontDir, 'LiberationSans-Regular.ttf'));
  copyFileSync(join(fontSrc, 'LICENSE'), join(fontDir, 'LICENSE-liberation.txt'));

  writeFileSync(
    join(fontDir, 'fonts.conf'),
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/tmp</cachedir>
</fontconfig>
`
  );

  writeFileSync(
    join(outDir, 'NOTICE.md'),
    `# Third-party components in this directory

## OpenSCAD (openscad.js, openscad.wasm)

OpenSCAD ${'`'}2025.07.18${'`'}, compiled to WebAssembly, from the
[openscad-wasm](https://www.npmjs.com/package/openscad-wasm) package version
${OPENSCAD_WASM_VERSION}. Upstream source: <https://github.com/openscad/openscad>.

Licensed under the **GNU General Public License, version 2 or (at your option) any
later version** — see ${'`'}COPYING${'`'}. Attraccess elects to receive OpenSCAD under the
terms of **GPL version 3**.

OpenSCAD is executed as a separate program: it is loaded as an unbundled static asset
into a dedicated Web Worker and driven through a command-line argument vector and a
virtual filesystem — the same interface as the ${'`'}openscad${'`'} CLI. It is not linked into
Attraccess.

### Modifications

OpenSCAD itself is **unmodified**. The Emscripten-generated loader shim in
${'`'}openscad.js${'`'} was replaced by ${'`'}tools/vendor-openscad.mjs${'`'} so that the WebAssembly
module is loaded from an external ${'`'}openscad.wasm${'`'} file and the compiled module is
cached between instances, instead of being decoded from an inlined base64 string on
every render. That script reproduces this directory exactly and documents the change.

Corresponding source for the version distributed here is available from the upstream
repository above; run ${'`'}node tools/vendor-openscad.mjs${'`'} to regenerate.

## Liberation Sans (fonts/LiberationSans-Regular.ttf)

Liberation Fonts ${LIBERATION_VERSION}, licensed under the SIL Open Font License 1.1 —
see ${'`'}fonts/LICENSE-liberation.txt${'`'}. Source:
<https://github.com/liberationfonts/liberation-fonts>.
`
  );

  console.log('\nVendored into apps/frontend/public/openscad/');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
