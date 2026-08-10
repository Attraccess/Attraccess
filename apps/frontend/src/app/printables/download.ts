import { zipSync } from 'fflate';
import { buildThreeMf } from './threemf';
import type { CardRender } from './useCardRender';

export const BODY_COLOR = '#B4B4B4';
export const LETTER_COLOR = '#1D9BF0';

/** Turns a label into something safe for a filename, falling back when nothing survives. */
export function toFileSlug(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'nfc-keychain-card';
}

/** The STLs come straight from OpenSCAD; both share one coordinate space, so import them together. */
export function buildStlZip(render: CardRender): Uint8Array<ArrayBuffer> {
  return zipSync({
    'body.stl': new Uint8Array(render.bodyStl),
    'letters.stl': new Uint8Array(render.lettersStl),
  });
}

export function downloadCard(render: CardRender, label: string, format: 'stl' | '3mf'): void {
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

  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
