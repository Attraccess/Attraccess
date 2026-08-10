# Third-party components in this directory

## OpenSCAD (openscad.js, openscad.wasm)

OpenSCAD `2025.07.18`, compiled to WebAssembly, from the
[openscad-wasm](https://www.npmjs.com/package/openscad-wasm) package version
0.0.4. Upstream source: <https://github.com/openscad/openscad>.

Licensed under the **GNU General Public License, version 2 or (at your option) any
later version** — see `COPYING`. Attraccess elects to receive OpenSCAD under the
terms of **GPL version 3**.

OpenSCAD is executed as a separate program: it is loaded as an unbundled static asset
into a dedicated Web Worker and driven through a command-line argument vector and a
virtual filesystem — the same interface as the `openscad` CLI. It is not linked into
Attraccess.

### Modifications

OpenSCAD itself is **unmodified**. The Emscripten-generated loader shim in
`openscad.js` was replaced by `tools/vendor-openscad.mjs` so that the WebAssembly
module is loaded from an external `openscad.wasm` file and the compiled module is
cached between instances, instead of being decoded from an inlined base64 string on
every render. That script reproduces this directory exactly and documents the change.

Corresponding source for the version distributed here is available from the upstream
repository above; run `node tools/vendor-openscad.mjs` to regenerate.

## Liberation Sans (fonts/LiberationSans-Regular.ttf)

Liberation Fonts 2.1.5, licensed under the SIL Open Font License 1.1 —
see `fonts/LICENSE-liberation.txt`. Source:
<https://github.com/liberationfonts/liberation-fonts>.
