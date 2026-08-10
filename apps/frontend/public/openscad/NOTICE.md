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

OpenSCAD itself is **unmodified**: Emscripten's own output, beginning at
`var OpenSCAD = (() => {` in `openscad.js`, is untouched. What
`tools/vendor-openscad.mjs` replaces is the loader shim that `@rollup/plugin-wasm`
generated when the upstream `openscad-wasm` package was bundled — the code that
inlined the wasm module as base64 and decoded it on every instance — with one that
loads an external `openscad.wasm` file and caches the compiled module between
instances. That script reproduces this directory exactly and documents the change.

Corresponding source for the version distributed here is available from the upstream
repository above; run `node tools/vendor-openscad.mjs` to regenerate.

## Liberation Sans (fonts/LiberationSans-Regular.ttf)

Liberation Fonts 2.1.5, licensed under the SIL Open Font License 1.1 —
see `fonts/LICENSE-liberation.txt`. Source:
<https://github.com/liberationfonts/liberation-fonts>.
