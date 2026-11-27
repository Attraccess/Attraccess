import { zipSync } from 'fflate';
import { buildThreeMf } from './threemf';
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
    return result.replace(pattern, `${name} = ${value};`);
  }, source);
}

/** Body and cover as two STLs in a ZIP, or as two objects in one 3MF. */
export function buildPlugFile(render: PlugRender, format: MeshFormat): Uint8Array<ArrayBuffer> {
  if (format === 'stl') {
    return zipSync({ 'body.stl': new Uint8Array(render.bodyStl), 'cover.stl': new Uint8Array(render.coverStl) });
  }
  return buildThreeMf([
    { name: 'Body', color: BODY_COLOR, mesh: render.body },
    { name: 'Cover', color: LETTER_COLOR, mesh: render.cover },
  ]);
}

export function downloadPlug(render: PlugRender, config: PlugConfig, format: MeshFormat): void {
  triggerDownload(buildPlugFile(render, format), `${plugFileSlug(config)}.${format === 'stl' ? 'zip' : '3mf'}`);
}
