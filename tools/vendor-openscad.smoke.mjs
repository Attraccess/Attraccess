// Verifies the vendored OpenSCAD build loads, finds its font, and renders.
//   node tools/vendor-openscad.smoke.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../apps/frontend/public/openscad');
const { createOpenSCAD } = await import(join(dir, 'openscad.js'));

const errs = [];
const api = await createOpenSCAD({ printErr: (t) => errs.push(t), print: () => {} });
const i = await api.getInstance();

i.FS.mkdir('/fonts');
i.FS.writeFile('/fonts/fonts.conf', readFileSync(join(dir, 'fonts/fonts.conf')));
i.FS.writeFile('/fonts/LiberationSans-Regular.ttf', readFileSync(join(dir, 'fonts/LiberationSans-Regular.ttf')));
i.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';

i.FS.writeFile('/t.scad', 'linear_extrude(1) text("Ok", size=5, font="Liberation Sans");');
try {
  i.callMain(['/t.scad', '--enable', 'textmetrics', '--backend', 'Manifold', '--export-format', 'binstl', '-o', '/o.stl']);
} catch {
  /* emscripten exits the runtime after callMain */
}

const stl = i.FS.readFile('/o.stl');
assert.ok(stl.length > 84, 'no STL produced');
assert.ok(!errs.some((e) => /Can't get font/.test(e)), `font not found:\n${errs.join('\n')}`);
console.log(`ok — rendered ${new DataView(stl.buffer, stl.byteOffset).getUint32(80, true)} triangles`);
