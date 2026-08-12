# Third-party components in this directory

## OpenSCAD (openscad.wasm.js, openscad.wasm)

OpenSCAD 2025.07.18 compiled to WebAssembly, downloaded verbatim from the
`wasm-latest` release of <https://github.com/Attraccess/openscad-wasm>.

Licensed under the **GNU General Public License, version 2 or (at your option) any
later version** — see `COPYING`. Attraccess elects to receive OpenSCAD under the
terms of **GPL version 3**.

### Modifications

That build applies one patch to OpenSCAD, `openscad-freetype-no-hinting.patch`,
which loads glyph outlines with `FT_LOAD_NO_HINTING`. OpenSCAD only decomposes
glyphs into 2D geometry, so hinting is pointless there — and under Emscripten the
autohinter it would otherwise reach traps the module for any font without a
TrueType bytecode program, which is most modern fonts.

**Corresponding source** for the version distributed here, including that patch and
the build pipeline that produced these files, is at
<https://github.com/Attraccess/openscad-wasm>. Nothing in this directory is modified after
download; `tools/vendor-openscad.mjs` only copies it into place.

OpenSCAD runs as a separate program: it is loaded as an unbundled static asset into
a dedicated Web Worker and driven through a command-line argument vector and a
virtual filesystem — the same interface as the `openscad` CLI. It is not linked
into Attraccess.

## Sansation (fonts/Sansation_Regular.ttf)

Sansation 1.31 by Bernd Montag, © 2011, All Rights Reserved.

Freeware, redistributable: the author's terms permit sharing the font on websites
and in software, for personal and commercial use, provided the files are not
renamed, not modified, not sold, and travel together with his ReadMe. All of those
conditions are met here — `fonts/Sansation_1.31_ReadMe.txt` is his
original text, distributed unchanged alongside the font.

Note that Sansation is **not** SIL OFL licensed, despite what several font
aggregator sites claim. The ReadMe above is the authoritative statement of terms.

Source: <https://www.dafont.com/sansation.font>
