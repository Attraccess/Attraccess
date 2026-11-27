// @vitest-environment node
// Node environment for the same reason as rfid-keychain-card.spec.ts: the vendored OpenSCAD
// glue must see a real file:// `import.meta.url`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBinaryStl, type Mesh, boundingBox } from './stl';
import {
  DEFAULT_PLUG_CONFIG,
  MIN_HEIGHT_ABOVE_PLUG,
  PLUG_CABLES,
  PLUG_DEVICES,
  toScadDefines,
  withCable,
  type PlugConfig,
} from './smartPlugConfig';

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

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ pathToFileURL(join(PUBLIC_DIR, 'openscad.wasm.js')).href);
  createOpenSCAD = mod.default;
  wasmModule = await WebAssembly.compile(readFileSync(join(PUBLIC_DIR, 'openscad.wasm')));
});

function volume(mesh: Mesh): number {
  let signedVolume = 0;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = mesh.positions.slice(i, i + 9);
    signedVolume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(signedVolume);
}

function width(mesh: Mesh): number {
  const box = boundingBox(mesh);
  return box.max[0] - box.min[0];
}

/** Vertices (as [x, y, z]) that satisfy `predicate`. */
function vertices(mesh: Mesh, predicate: (x: number, y: number, z: number) => boolean): number[][] {
  const found: number[][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
    if (predicate(x, y, z)) found.push([x, y, z]);
  }
  return found;
}

/** Renders one part with raw `-D` defines; resolves to null when OpenSCAD writes no file. */
async function renderRaw(part: 'body' | 'cover', defines: Record<string, string | number>): Promise<Mesh | null> {
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
  const args = Object.entries({ PART: JSON.stringify(part), ...defines }).flatMap(([name, value]) => [
    '-D',
    `${name}=${value}`,
  ]);
  try {
    instance.callMain([
      '/cover.scad',
      '--enable',
      'textmetrics',
      '--backend',
      'Manifold',
      '--export-format',
      'binstl',
      ...args,
      '-o',
      '/out.stl',
    ]);
  } catch {
    // callMain exits the Emscripten runtime after rendering.
  }
  try {
    return parseBinaryStl(new Uint8Array(instance.FS.readFile('/out.stl')).buffer);
  } catch {
    return null;
  }
}

const renders = new Map<string, Promise<Mesh | null>>();

/** Renders one part the way the worker does, through `toScadDefines`. Cached: renders are slow. */
async function render(part: 'body' | 'cover', config: Partial<PlugConfig> = {}): Promise<Mesh> {
  const defines = toScadDefines({ ...DEFAULT_PLUG_CONFIG, ...config });
  const key = JSON.stringify([part, defines]);
  if (!renders.has(key)) renders.set(key, renderRaw(part, defines));
  const mesh = await renders.get(key);
  if (!mesh) throw new Error(`OpenSCAD produced no ${part}`);
  return mesh;
}

/** The STEP reference is the angled-cable Nous cover. */
const STEP: Partial<PlugConfig> = { cable: 'angled_schuko' };

describe('smart-plug-cover.scad', () => {
  it('renders the STEP-aligned Nous body and cover', async () => {
    const body = await render('body', STEP);
    const cover = await render('cover', STEP);
    const bodyBox = boundingBox(body);
    expect(bodyBox.min[2]).toBeCloseTo(-0.8, 2);
    expect(bodyBox.max[2]).toBeCloseTo(60.8, 2);
    expect(width(body)).toBeCloseTo(53.7, 2);
    // The 45.9 mm cover skirt sits in the 46.5 mm upper body bore.
    expect(boundingBox(cover).min[2]).toBeCloseTo(43, 2);
    expect(boundingBox(cover).max[2]).toBeCloseTo(60.8, 2);
    expect(width(cover)).toBeCloseTo(45.9, 2);
    // Volume catches an inverted bore or a missing wordmark despite matching bounds (the seal
    // passages have their own checks below). #1734's values; the wordmark rows now stay clear of
    // the bottom face, which leaves about 110 mm³ more body.
    expect(Math.abs(volume(body) - 31_458.4)).toBeLessThan(150);
    expect(Math.abs(volume(cover) - 6_718.2)).toBeLessThan(100);
  }, 60_000);

  it('recesses the Attraccess wordmark into the body', async () => {
    const branded = await render('body');
    const plain = await renderRaw('body', { ...toScadDefines(DEFAULT_PLUG_CONFIG), BRAND: '""' });
    expect(plain).not.toBeNull();
    // Same envelope, but the engraving removes material.
    expect(boundingBox(branded)).toEqual(boundingBox(plain as Mesh));
    expect(volume(plain as Mesh) - volume(branded)).toBeGreaterThan(200);
  }, 60_000);

  it.each([
    ['the default straight cable', {}],
    ['a tall angled cover', { cable: 'angled_schuko', heightAbovePlug: 22 }],
    ['the shortest body', { device: 'shelly_legacy', cable: 'angled_schuko', heightAbovePlug: MIN_HEIGHT_ABOVE_PLUG }],
  ] as const)(
    'keeps every wordmark clear of the bottom face and the rim for %s',
    async (_, config) => {
      const body = await render('body', config);
      const box = boundingBox(body);
      // The recess floor is the only surface 1.4 mm inside the outer wall.
      const floorRadius = (box.max[0] - box.min[0]) / 2 - 1.4;
      const floor = vertices(body, (x, y) => Math.abs(Math.hypot(x, y) - floorRadius) < 0.02);
      expect(floor.length).toBeGreaterThan(0);
      const zs = floor.map(([, , z]) => z);
      expect(Math.min(...zs)).toBeGreaterThan(box.min[2] + 0.5);
      // Below the 1 mm rounded rim.
      expect(Math.max(...zs)).toBeLessThan(box.max[2] - 1.5);
    },
    60_000,
  );

  it('cuts both seal passages out through the body wall', async () => {
    const body = await render('body');
    const outerRadius = width(body) / 2;
    // Each passage leaves the outer wall as a 5 mm wide opening, on opposite sides.
    for (const side of [1, -1]) {
      const edges = vertices(
        body,
        (x, y) => side * x > 0 && Math.abs(Math.abs(y) - 2.5) < 1e-3 && Math.abs(Math.hypot(x, y) - outerRadius) < 0.05,
      );
      expect(edges.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('cuts both 3 x 5 mm seal passages through the cover top', async () => {
    const cover = await render('cover');
    const top = boundingBox(cover).max[2];
    // Each passage leaves a 3 mm (x) by 5 mm (y) opening centred on x = ±18.55 mm.
    for (const side of [1, -1]) {
      const corners = vertices(
        cover,
        (x, y, z) =>
          Math.abs(z - top) < 1e-3 && Math.abs(Math.abs(y) - 2.5) < 1e-3 && Math.abs(side * x - 18.55) <= 1.5 + 1e-3,
      );
      expect(corners.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('applies the published Shelly diameter and depth differences', async () => {
    const plusBody = await render('body', { ...STEP, device: 'shelly_plus_gen3' });
    const plusCover = await render('cover', { ...STEP, device: 'shelly_plus_gen3' });
    const legacyBody = await render('body', { ...STEP, device: 'shelly_legacy' });
    const legacyCover = await render('cover', { ...STEP, device: 'shelly_legacy' });
    // 2 mm smaller diameter, 2 mm shorter.
    expect(width(plusBody)).toBeCloseTo(51.7, 2);
    expect(boundingBox(plusBody).max[2]).toBeCloseTo(58.8, 2);
    expect(width(plusCover)).toBeCloseTo(43.9, 2);
    // Same diameter as Nous, 3 mm shorter.
    expect(width(legacyBody)).toBeCloseTo(53.7, 2);
    expect(boundingBox(legacyBody).max[2]).toBeCloseTo(57.8, 2);
    expect(width(legacyCover)).toBeCloseTo(45.9, 2);
  }, 60_000);

  it('widens the bore by the extra device clearance', async () => {
    const body = await render('body', { deviceExtraDiameter: 2 });
    expect(width(body)).toBeCloseTo(55.7, 2);
  }, 60_000);

  it('cuts the side cable mouth only for angled cables', async () => {
    const straight = await render('body');
    const angledEuro = await render('body', { cable: 'angled_euro' });
    const angledSchuko = await render('body', { cable: 'angled_schuko' });
    const straightCover = await render('cover');
    const angledCover = await render('cover', { cable: 'angled_schuko' });
    expect(volume(angledEuro)).toBeLessThan(volume(straight) - 500);
    // Both angled presets use the same fixed 30.9 mm slot and 34.17 mm mouth.
    expect(volume(angledSchuko)).toBeCloseTo(volume(angledEuro), 5);
    expect(volume(angledCover)).toBeLessThan(volume(straightCover));
    // The mouth leaves no body wall at the front above the 36.6 mm cutout floor.
    const frontWall = (x: number, y: number, z: number) => y < -20 && Math.abs(x) < 15 && z > 38;
    expect(vertices(straight, frontWall).length).toBeGreaterThan(0);
    expect(vertices(angledSchuko, frontWall)).toEqual([]);
  }, 60_000);

  it('sizes the straight cover opening from the cable opening diameter', async () => {
    const narrow = await render('cover', { cordOpeningDiameter: 5 });
    const wide = await render('cover', { cordOpeningDiameter: 16 });
    expect(volume(narrow)).toBeGreaterThan(volume(wide));
    // The slot is as wide as the opening: its edges sit at x = ±8 mm for a 16 mm opening.
    expect(vertices(wide, (x, y) => y < -15 && Math.abs(Math.abs(x) - 8) < 1e-3).length).toBeGreaterThan(0);
  }, 60_000);

  it('makes the angled heights configurable', async () => {
    const body = await render('body', { cable: 'angled_schuko', heightAbovePlug: 25, cableCutoutHeight: 30 });
    const cover = await render('cover', { cable: 'angled_schuko', heightAbovePlug: 25, cableCutoutHeight: 30 });
    expect(boundingBox(body).max[2]).toBeCloseTo(68, 2);
    expect(boundingBox(cover).max[2]).toBeCloseTo(68, 2);
    // The cable cutout starts 30 mm below the top: 38 mm.
    const cutFloor = vertices(body, (x, y, z) => y < -20 && Math.abs(x) < 15 && Math.abs(z - 38) < 1e-3);
    expect(cutFloor.length).toBeGreaterThan(0);
  }, 60_000);

  it('ignores angled heights for a straight cable, even when passed directly', async () => {
    const defaults = await render('body');
    const leaked = await renderRaw('body', {
      ...toScadDefines(DEFAULT_PLUG_CONFIG),
      HEIGHT_ABOVE_PLUG: 30,
      CABLE_CUT_H: 35,
    });
    expect(boundingBox(leaked as Mesh)).toEqual(boundingBox(defaults));
    expect(volume(leaked as Mesh)).toBeCloseTo(volume(defaults), 3);
  }, 60_000);

  it('keeps the cover retaining ring at the minimum angled height', async () => {
    const cover = await render('cover', { cable: 'angled_schuko', heightAbovePlug: MIN_HEIGHT_ABOVE_PLUG });
    const top = boundingBox(cover).max[2];
    expect(top).toBeCloseTo(43 + MIN_HEIGHT_ABOVE_PLUG, 2);
    // The ring reaches in to the 30.9 mm slot; the skirt alone stops at its 40.5 mm bore.
    const ring = vertices(cover, (x, y, z) => Math.abs(z - top) < 1e-3 && Math.hypot(x, y) < 40.5 / 2 - 1);
    expect(ring.length).toBeGreaterThan(0);
  }, 60_000);

  it.each([
    ['a height below the cover skirt', { CABLE: '"angled_schuko"', HEIGHT_ABOVE_PLUG: 12 }],
    ['a height just below the minimum', { CABLE: '"angled_schuko"', HEIGHT_ABOVE_PLUG: MIN_HEIGHT_ABOVE_PLUG - 0.1 }],
    ['a straight Euro opening above 12 mm', { CABLE: '"straight_euro"', CORD_OPEN_D: 13 }],
    ['a straight Schuko opening above 16 mm', { CORD_OPEN_D: 17 }],
    ['an unknown device', { DEVICE: '"other"' }],
  ])(
    'refuses %s',
    async (_, defines) => {
      expect(await renderRaw('cover', { ...toScadDefines(DEFAULT_PLUG_CONFIG), ...defines })).toBeNull();
    },
    60_000,
  );

  it.each(PLUG_DEVICES.flatMap((device) => PLUG_CABLES.map((cable) => [device, cable] as const)))(
    'renders a separate body and cover for %s with %s',
    async (device, cable) => {
      const config = withCable({ ...DEFAULT_PLUG_CONFIG, device }, cable);
      const body = await render('body', config);
      const cover = await render('cover', config);
      expect(body.triangleCount).toBeGreaterThan(0);
      expect(cover.triangleCount).toBeGreaterThan(0);
      // The cover sits inside the body bore, so it is always narrower.
      expect(width(cover)).toBeLessThan(width(body));
    },
    60_000,
  );
});
