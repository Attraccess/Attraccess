import { zipSync } from 'fflate';
import { buildThreeMf } from './threemf';
import type { CardRender } from './useCardRender';
import type { PlugRender } from './usePlugRender';

/**
 * Part colours, shared by the three.js preview and the 3MF `displaycolor`, so the file opens in
 * a slicer looking like what the preview showed.
 */
export const BODY_COLOR = '#256D7B';
export const LETTER_COLOR = '#FFFFFF';

/** Turns a label into something safe for a filename, falling back when nothing survives. */
export function toFileSlug(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

  // A label with nothing filename-safe in it (e.g. "!!!") would otherwise leave a dangling
  // separator: "attraccess-nfc-card-".
  return slug ? `attraccess-nfc-card-${slug}` : 'attraccess-nfc-card';
}

/** The STLs come straight from OpenSCAD; both share one coordinate space, so import them together. */
export function buildStlZip(render: CardRender): Uint8Array<ArrayBuffer> {
  return zipSync({
    'body.stl': new Uint8Array(render.bodyStl),
    'letters.stl': new Uint8Array(render.lettersStl),
  });
}

/**
 * Triggers a browser download of `data` as `filename`, via a throwaway object URL and an
 * off-DOM anchor click. Shared by every download in this feature (STL/3MF here, the .scad
 * source elsewhere) so the object-URL lifetime bug below only has to be fixed once.
 *
 * `URL.revokeObjectURL` is deferred to a macrotask rather than called synchronously after
 * `click()`: Firefox and older Safari can abort the download if the URL is revoked before the
 * click has actually been dispatched to the download handler.
 */
export function triggerDownload(data: BlobPart, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Formats that need a finished render. */
export type MeshFormat = 'stl' | '3mf';
/** Everything offered in the format picker. `scad` is the source and needs no render. */
export type DownloadFormat = MeshFormat | 'scad';

/**
 * Rewrites the `.scad` source so its `LABEL` default is the label the user actually typed,
 * making the downloaded source reproduce what the preview shows rather than the built-in
 * default. `JSON.stringify` escapes quotes and backslashes, which OpenSCAD string literals
 * accept in the same form.
 *
 * Throws rather than silently returning the source unchanged if the assignment cannot be
 * found: a quiet no-op would hand the user a file with somebody else's label. `download.spec.ts`
 * pins the shipped `.scad` against this pattern so it cannot drift unnoticed.
 */
export function scadWithLabel(source: string, label: string): string {
  const pattern = /^LABEL\s*=.*$/m;
  if (!pattern.test(source)) {
    throw new Error('Could not find the LABEL assignment in the .scad source');
  }
  return source.replace(pattern, `LABEL = ${JSON.stringify(label)};`);
}

export function downloadCard(render: CardRender, label: string, format: MeshFormat): void {
  const slug = toFileSlug(label);

  const [data, filename] =
    format === 'stl'
      ? [buildStlZip(render), `${slug}.zip`]
      : [
          buildThreeMf([
            { name: 'Body', color: BODY_COLOR, mesh: render.body },
            { name: 'Letters', color: LETTER_COLOR, mesh: render.letters },
          ]),
          `${slug}.3mf`,
        ];

  triggerDownload(data, filename);
}

export function plugScadSource(
  source: string,
  device: string,
  cable: string,
  deviceExtraDiameter: number,
  cordOpeningDiameter: number,
  heightAbovePlug: number,
  cableCutoutHeight: number,
): string {
  const assignments: Record<string, string> = {
    DEVICE: JSON.stringify(device),
    CABLE: JSON.stringify(cable),
    DEVICE_EXTRA_D: String(deviceExtraDiameter),
    CORD_OPEN_D: String(cordOpeningDiameter),
    HEIGHT_ABOVE_PLUG: String(heightAbovePlug),
    CABLE_CUT_H: String(cableCutoutHeight),
  };
  return Object.entries(assignments).reduce((result, [name, value]) => {
    const pattern = new RegExp(`^${name}\\s*=.*$`, 'm');
    if (!pattern.test(result)) throw new Error(`Could not find the ${name} assignment in the .scad source`);
    return result.replace(pattern, `${name} = ${value};`);
  }, source);
}

export function downloadPlug(
  render: PlugRender,
  device: string,
  cable: string,
  deviceExtraDiameter: number,
  cordOpeningDiameter: number,
  heightAbovePlug: number,
  cableCutoutHeight: number,
  format: MeshFormat,
): void {
  const custom = `clearance-${deviceExtraDiameter}-opening-${cordOpeningDiameter}-above-${heightAbovePlug}-cutout-${cableCutoutHeight}`;
  const slug = `attraccess-smart-plug-cover-${device}-${cable}-${custom}`;
  const [data, filename] =
    format === 'stl'
      ? [
          zipSync({ 'body.stl': new Uint8Array(render.bodyStl), 'cover.stl': new Uint8Array(render.coverStl) }),
          `${slug}.zip`,
        ]
      : [
          buildThreeMf([
            { name: 'Body', color: BODY_COLOR, mesh: render.body },
            { name: 'Cover', color: LETTER_COLOR, mesh: render.cover },
          ]),
          `${slug}.3mf`,
        ];
  triggerDownload(data, filename);
}
