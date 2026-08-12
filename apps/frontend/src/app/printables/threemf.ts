import { zipSync, strToU8 } from 'fflate';
import type { Mesh } from './stl';

export interface ThreeMfPart {
  name: string;
  /** `#RRGGBB`. */
  color: string;
  mesh: Mesh;
}

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rounds to micrometres — below any printer's resolution, and it makes vertices comparable. */
function key(x: number, y: number, z: number): string {
  return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
}

function meshXml(mesh: Mesh): string {
  const indexOf = new Map<string, number>();
  const vertices: string[] = [];
  const triangles: string[] = [];

  for (let t = 0; t < mesh.triangleCount; t++) {
    const corners: number[] = [];

    for (let v = 0; v < 3; v++) {
      const offset = t * 9 + v * 3;
      const [x, y, z] = [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
      const k = key(x, y, z);

      let index = indexOf.get(k);
      if (index === undefined) {
        index = vertices.length;
        indexOf.set(k, index);
        // Emit the same rounded precision the vertex was deduped under (`key`, above). Writing
        // the raw float instead can (a) print in scientific notation for float32 noise near
        // zero — legal XSD double, but a real risk for lenient slicer 3MF float parsers — and
        // (b) disagree with the coordinate the dedup key actually represents.
        vertices.push(`<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}" />`);
      }
      corners.push(index);
    }

    // A degenerate triangle (two corners collapsed onto one vertex) is invalid in 3MF.
    if (corners[0] === corners[1] || corners[1] === corners[2] || corners[0] === corners[2]) continue;
    triangles.push(`<triangle v1="${corners[0]}" v2="${corners[1]}" v3="${corners[2]}" />`);
  }

  return `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`;
}

/** Builds a 3MF container holding one coloured object per part, all in a shared coordinate space. */
export function buildThreeMf(parts: ThreeMfPart[]): Uint8Array<ArrayBuffer> {
  const materials = parts
    .map((part) => `<base name="${escapeXml(part.name)}" displaycolor="${part.color.toUpperCase()}FF" />`)
    .join('');

  // Resource id 1 is the material group; objects start at 2.
  const objects = parts
    .map(
      (part, index) =>
        `<object id="${index + 2}" type="model" pid="1" pindex="${index}">${meshXml(part.mesh)}</object>`,
    )
    .join('');

  const items = parts.map((_, index) => `<item objectid="${index + 2}" />`).join('');

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}">
 <resources>
  <basematerials id="1">${materials}</basematerials>
  ${objects}
 </resources>
 <build>${items}</build>
</model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
}
