#!/usr/bin/env node
// Vendors OpenSCAD (wasm) and the Sansation font into apps/frontend/public/openscad/.
// Run manually; the output is committed. Not part of the build.
//
//   node tools/vendor-openscad.mjs
//
// The wasm comes from Attraccess/openscad-wasm rather than upstream. That fork
// carries a one-line patch loading glyph outlines with FT_LOAD_NO_HINTING; without
// it the module traps on any font that ships without a TrueType bytecode program
// (no cvt/fpgm/prep), which includes Sansation and most modern fonts. See that
// repo's patches/ directory for the full reasoning.
//
// Nothing downloaded here is modified. The previous revision of this script
// patched the Emscripten loader to load an external .wasm and cache the compiled
// module; that is no longer necessary — the worker supplies its own
// `instantiateWasm` with a cached WebAssembly.Module instead, so everything under
// public/openscad/ is now byte-for-byte what upstream produced.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WASM_REPO = 'Attraccess/openscad-wasm';
const WASM_RELEASE = 'wasm-latest';
const OPENSCAD_VERSION = '2025.07.18';

// The author's own recommended source (his ReadMe points at dafont).
const SANSATION_URL = 'https://dl.dafont.com/dl/?f=sansation';
const SANSATION_VERSION = '1.31';

const OPENSCAD_COPYING_URL = 'https://raw.githubusercontent.com/openscad/openscad/master/COPYING';

// Pinned so a re-run cannot silently pull something different.
const EXPECTED = {
  'Sansation_Regular.ttf': 'c0770982633d933a09da349cf0dde6cfd70d6f9d91f1df436410c4d014a3216d',
  'Sansation_1.31_ReadMe.txt': '60163875037aa25f15a06e28e9aef6d05fecb7e71d201129455305d50eb613bc',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/frontend/public/openscad');
const fontDir = join(outDir, 'fonts');
const tmp = mkdtempSync(join(tmpdir(), 'vendor-openscad-'));

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function checkPinned(name, path) {
  const expected = EXPECTED[name];
  if (!expected) return;
  const actual = sha256(readFileSync(path));
  if (actual !== expected) {
    throw new Error(`${name} does not match its pinned checksum.\n  expected ${expected}\n  actual   ${actual}`);
  }
}

mkdirSync(fontDir, { recursive: true });

try {
  // --- OpenSCAD wasm, from our patched build -------------------------------
  console.log(`Fetching ${WASM_REPO} release ${WASM_RELEASE}...`);
  execFileSync(
    'gh',
    ['release', 'download', WASM_RELEASE, '--repo', WASM_REPO, '--dir', tmp,
     '--pattern', 'openscad.wasm', '--pattern', 'openscad.wasm.js'],
    { stdio: 'inherit' },
  );

  for (const name of ['openscad.wasm.js', 'openscad.wasm']) {
    const src = join(tmp, name);
    const bytes = readFileSync(src);
    if (name.endsWith('.wasm') && bytes.subarray(0, 4).toString('binary') !== '\0asm') {
      throw new Error('Downloaded openscad.wasm is not a WebAssembly module.');
    }
    copyFileSync(src, join(outDir, name));
    console.log(`  ${name.padEnd(18)} ${(bytes.length / 1e6).toFixed(1)} MB  sha256 ${sha256(bytes).slice(0, 16)}…`);
  }

  const copying = await fetch(OPENSCAD_COPYING_URL).then((r) => {
    if (!r.ok) throw new Error(`COPYING fetch failed: ${r.status}`);
    return r.text();
  });
  writeFileSync(join(outDir, 'COPYING'), copying);

  // --- Sansation -----------------------------------------------------------
  // Its licence requires that the files keep their names and travel with the
  // author's ReadMe, so both are copied verbatim.
  console.log(`Fetching Sansation ${SANSATION_VERSION}...`);
  const zipPath = join(tmp, 'sansation.zip');
  const zip = Buffer.from(
    await fetch(SANSATION_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }),
  );
  writeFileSync(zipPath, zip);
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', join(tmp, 'sansation')]);

  for (const name of ['Sansation_Regular.ttf', `Sansation_${SANSATION_VERSION}_ReadMe.txt`]) {
    const src = join(tmp, 'sansation', name);
    checkPinned(name, src);
    copyFileSync(src, join(fontDir, name));
    console.log(`  ${name}`);
  }

  writeFileSync(
    join(fontDir, 'fonts.conf'),
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/tmp</cachedir>
</fontconfig>
`,
  );

  writeFileSync(
    join(outDir, 'NOTICE.md'),
    `# Third-party components in this directory

## OpenSCAD (openscad.wasm.js, openscad.wasm)

OpenSCAD ${OPENSCAD_VERSION} compiled to WebAssembly, downloaded verbatim from the
${'`'}${WASM_RELEASE}${'`'} release of <https://github.com/${WASM_REPO}>.

Licensed under the **GNU General Public License, version 2 or (at your option) any
later version** — see ${'`'}COPYING${'`'}. Attraccess elects to receive OpenSCAD under the
terms of **GPL version 3**.

### Modifications

That build applies one patch to OpenSCAD, ${'`'}openscad-freetype-no-hinting.patch${'`'},
which loads glyph outlines with ${'`'}FT_LOAD_NO_HINTING${'`'}. OpenSCAD only decomposes
glyphs into 2D geometry, so hinting is pointless there — and under Emscripten the
autohinter it would otherwise reach traps the module for any font without a
TrueType bytecode program, which is most modern fonts.

**Corresponding source** for the version distributed here, including that patch and
the build pipeline that produced these files, is at
<https://github.com/${WASM_REPO}>. Nothing in this directory is modified after
download; ${'`'}tools/vendor-openscad.mjs${'`'} only copies it into place.

OpenSCAD runs as a separate program: it is loaded as an unbundled static asset into
a dedicated Web Worker and driven through a command-line argument vector and a
virtual filesystem — the same interface as the ${'`'}openscad${'`'} CLI. It is not linked
into Attraccess.

## Sansation (fonts/Sansation_Regular.ttf)

Sansation ${SANSATION_VERSION} by Bernd Montag, © 2011, All Rights Reserved.

Freeware, redistributable: the author's terms permit sharing the font on websites
and in software, for personal and commercial use, provided the files are not
renamed, not modified, not sold, and travel together with his ReadMe. All of those
conditions are met here — ${'`'}fonts/Sansation_${SANSATION_VERSION}_ReadMe.txt${'`'} is his
original text, distributed unchanged alongside the font.

Note that Sansation is **not** SIL OFL licensed, despite what several font
aggregator sites claim. The ReadMe above is the authoritative statement of terms.

Source: <https://www.dafont.com/sansation.font>
`,
  );

  console.log('\nVendored into apps/frontend/public/openscad/');
  console.log('Reminder: apps/frontend/src/app/dependencies/index.tsx carries the');
  console.log('OpenSCAD and font versions as literals — update them alongside this.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
