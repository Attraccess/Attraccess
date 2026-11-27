import { zipSync } from 'fflate';
import { buildThreeMf } from './threemf';
import { boundingBox, type Mesh } from './stl';
import { BODY_COLOR, LETTER_COLOR, triggerDownload, type MeshFormat } from './download';
import { effectivePlugConfig, toScadDefines, type PlugConfig } from './smartPlugConfig';
import type { PlugRender } from './usePlugRender';

/**
 * File name (without extension) naming the device, the cable and every dimension that shapes
 * the model, so prints of different configurations can be told apart.
 */
export function plugFileSlug(config: PlugConfig): string {
  const c = effectivePlugConfig(config);
  return [
    'attraccess-smart-plug-cover',
    c.device,
    c.cable,
    `clearance-${c.deviceExtraDiameter}mm`,
    `opening-${c.cordOpeningDiameter}mm`,
    `height-${c.heightAbovePlug}mm`,
    `cutout-${c.cableCutoutHeight}mm`,
  ]
    .join('-')
    .replace(/_/g, '-');
}

/**
 * Writes every configured value into the `.scad` source's parameter defaults, so the downloaded
 * file reproduces the preview. Throws if an assignment is missing rather than silently handing
 * out a file with the built-in defaults; `plugDownload.spec.ts` pins the shipped source.
 */
export function plugScadSource(source: string, config: PlugConfig): string {
  return Object.entries(toScadDefines(config)).reduce((result, [name, value]) => {
    const pattern = new RegExp(`^${name}\\s*=.*$`, 'm');
    if (!pattern.test(result)) throw new Error(`Could not find the ${name} assignment in the .scad source`);
    return result.replace(pattern, () => `${name} = ${value};`);
  }, source);
}

/** Gap between body and cover on the build plate, in mm. */
const PLATE_GAP = 10;

/**
 * Build-plate positions for body and cover: both standing on z = 0, the cover beside the body.
 * The meshes come out of OpenSCAD assembled (the cover sits inside the body's bore), and
 * slicers keep a 3MF's positions, so without this the two parts would overlap on the plate.
 */
export function plateOffsets(body: Mesh, cover: Mesh): [[number, number, number], [number, number, number]] {
  const b = boundingBox(body);
  const c = boundingBox(cover);
  return [
    [0, 0, -b.min[2]],
    [b.max[0] + PLATE_GAP - c.min[0], 0, -c.min[2]],
  ];
}

/** Body and cover as two STLs in a ZIP, or as two objects side by side in one 3MF. */
export function buildPlugFile(render: PlugRender, format: MeshFormat): Uint8Array<ArrayBuffer> {
  if (format === 'stl') {
    return zipSync({ 'body.stl': new Uint8Array(render.bodyStl), 'cover.stl': new Uint8Array(render.coverStl) });
  }
  const [bodyOffset, coverOffset] = plateOffsets(render.body, render.cover);
  return buildThreeMf([
    { name: 'Body', color: BODY_COLOR, mesh: render.body, offset: bodyOffset },
    { name: 'Cover', color: LETTER_COLOR, mesh: render.cover, offset: coverOffset },
  ]);
}

export function downloadPlug(render: PlugRender, config: PlugConfig, format: MeshFormat): void {
  triggerDownload(buildPlugFile(render, format), `${plugFileSlug(config)}.${format === 'stl' ? 'zip' : '3mf'}`);
}
