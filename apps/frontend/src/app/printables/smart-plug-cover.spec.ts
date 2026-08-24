// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBinaryStl, type Mesh } from './stl';
import { boundingBox } from './testBoundingBox';

const PUBLIC_DIR = join(__dirname, '../../../public/openscad');
const SCAD = readFileSync(join(__dirname, 'smart-plug-cover.scad'), 'utf8');

interface OpenScadInstance {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  ENV: Record<string, string>;
  callMain(args: string[]): void;
}

let createOpenSCAD: (options: Record<string, unknown>) => Promise<OpenScadInstance>;
let wasmModule: WebAssembly.Module;

function volume(mesh: Mesh): number {
  let signedVolume = 0;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = mesh.positions.slice(i, i + 9);
    signedVolume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(signedVolume);
}

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ pathToFileURL(join(PUBLIC_DIR, 'openscad.wasm.js')).href);
  createOpenSCAD = mod.default;
  wasmModule = await WebAssembly.compile(readFileSync(join(PUBLIC_DIR, 'openscad.wasm')));
});

async function render(
  part: 'body' | 'cover',
  device = 'nous_a1',
  cable = 'angled_schuko',
  deviceExtraDiameter = 0,
  cordOpeningDiameter = 30.9,
  heightAbovePlug = 17.8,
  cableCutoutHeight = 24.2,
): Promise<Mesh | null> {
  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: () => undefined,
    printErr: () => undefined,
    instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(wasmModule, imports).then(done);
      return {};
    },
  });
  instance.FS.mkdir('/fonts');
  instance.FS.writeFile('/fonts/fonts.conf', readFileSync(join(PUBLIC_DIR, 'fonts/fonts.conf')));
  instance.FS.writeFile('/fonts/Sansation_Regular.ttf', readFileSync(join(PUBLIC_DIR, 'fonts/Sansation_Regular.ttf')));
  instance.ENV.FONTCONFIG_FILE = '/fonts/fonts.conf';
  instance.FS.writeFile('/cover.scad', SCAD);
  try {
    instance.callMain([
      '/cover.scad',
      '--enable',
      'textmetrics',
      '--backend',
      'Manifold',
      '--export-format',
      'binstl',
      '-D',
      `PART=${JSON.stringify(part)}`,
      '-D',
      `DEVICE=${JSON.stringify(device)}`,
      '-D',
      `CABLE=${JSON.stringify(cable)}`,
      '-D',
      `DEVICE_EXTRA_D=${deviceExtraDiameter}`,
      '-D',
      `CORD_OPEN_D=${cordOpeningDiameter}`,
      '-D',
      `HEIGHT_ABOVE_PLUG=${heightAbovePlug}`,
      '-D',
      `CABLE_CUT_H=${cableCutoutHeight}`,
      '-o',
      '/out.stl',
    ]);
  } catch {
    /* callMain exits the Emscripten runtime after rendering. */
  }
  try {
    const data = instance.FS.readFile('/out.stl');
    return parseBinaryStl(new Uint8Array(data).buffer);
  } catch {
    return null;
  }
}

describe('smart-plug-cover.scad', () => {
  it('renders the STEP-aligned Nous body and cover', async () => {
    const [body, cover] = await Promise.all([render('body'), render('cover')]);
    expect(body).not.toBeNull();
    expect(cover).not.toBeNull();
    const bodyBox = boundingBox(body as Mesh);
    expect(bodyBox.min[2]).toBeCloseTo(-0.8, 2);
    expect(bodyBox.max[2]).toBeCloseTo(60.8, 2);
    expect(bodyBox.max[0] - bodyBox.min[0]).toBeCloseTo(53.7, 2);
    // The 45.9 mm cover skirt occupies the 46.5 mm upper body bore.
    expect(boundingBox(cover as Mesh).min[2]).toBeCloseTo(43, 2);
    expect(boundingBox(cover as Mesh).max[2]).toBeCloseTo(60.8, 2);
    expect(boundingBox(cover as Mesh).max[0] - boundingBox(cover as Mesh).min[0]).toBeCloseTo(45.9, 2);
    // Volume catches an inverted bore, missing engraving, or blind seal passages despite matching bounds.
    expect(Math.abs(volume(body as Mesh) - 31_458.4)).toBeLessThan(150);
    expect(Math.abs(volume(cover as Mesh) - 6_718.2)).toBeLessThan(100);
  }, 30_000);

  it('applies the published Shelly envelope deltas', async () => {
    const [plusBody, plusCover, legacyBody] = await Promise.all([
      render('body', 'shelly_plus_gen3'),
      render('cover', 'shelly_plus_gen3'),
      render('body', 'shelly_legacy'),
    ]);
    expect(boundingBox(plusBody as Mesh).max[0] - boundingBox(plusBody as Mesh).min[0]).toBeCloseTo(51.7, 2);
    expect(boundingBox(plusBody as Mesh).max[2]).toBeCloseTo(58.8, 2);
    expect(boundingBox(plusCover as Mesh).max[0] - boundingBox(plusCover as Mesh).min[0]).toBeCloseTo(43.9, 2);
    expect(boundingBox(legacyBody as Mesh).max[2]).toBeCloseTo(57.8, 2);
  }, 30_000);

  it('cuts an adjustable side relief only for angled cords', async () => {
    const [straight, angledEuro, angledSchuko, straightCover, angledCover, taller] = await Promise.all([
      render('body', 'nous_a1', 'straight_schuko', 0, 12),
      render('body', 'nous_a1', 'angled_euro'),
      render('body', 'nous_a1', 'angled_schuko'),
      render('cover', 'nous_a1', 'straight_schuko', 0, 12),
      render('cover', 'nous_a1', 'angled_schuko'),
      render('body', 'nous_a1', 'angled_schuko', 0, 30.9, 25, 30),
    ]);
    expect(volume(angledEuro as Mesh)).toBeLessThan(volume(straight as Mesh));
    expect(volume(angledSchuko as Mesh)).toBeCloseTo(volume(angledEuro as Mesh), 5);
    expect(volume(angledCover as Mesh)).toBeLessThan(volume(straightCover as Mesh));
    expect(boundingBox(taller as Mesh).max[2]).toBeCloseTo(68, 2);
  }, 30_000);
});
