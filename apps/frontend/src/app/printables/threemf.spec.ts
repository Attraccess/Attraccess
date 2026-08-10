import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildThreeMf } from './threemf';
import { toFileSlug } from './download';
import type { Mesh } from './stl';

/** A single triangle with one duplicated vertex position, to exercise deduplication. */
const triangle: Mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triangleCount: 1,
};

function model(zip: Record<string, Uint8Array>): string {
  return strFromU8(zip['3D/3dmodel.model']);
}

describe('buildThreeMf', () => {
  it('produces a zip with the three required 3MF parts', () => {
    const zip = unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: triangle }]));
    expect(Object.keys(zip).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
  });

  it('declares millimetres, since every slicer depends on the unit', () => {
    const xml = model(unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: triangle }])));
    expect(xml).toContain('unit="millimeter"');
  });

  it('emits one object per part with its own colour', () => {
    const xml = model(
      unzipSync(
        buildThreeMf([
          { name: 'Body', color: '#B4B4B4', mesh: triangle },
          { name: 'Letters', color: '#1D9BF0', mesh: triangle },
        ]),
      ),
    );
    expect(xml).toContain('<base name="Body" displaycolor="#B4B4B4FF"');
    expect(xml).toContain('<base name="Letters" displaycolor="#1D9BF0FF"');
    expect(xml.match(/<object /g)).toHaveLength(2);
    expect(xml.match(/<item /g)).toHaveLength(2);
  });

  it('deduplicates vertices and indexes triangles into them', () => {
    const twoTriangles: Mesh = {
      // Two triangles sharing an edge: 6 vertex slots, 4 distinct positions.
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      triangleCount: 2,
    };
    const xml = model(unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: twoTriangles }])));
    expect(xml.match(/<vertex /g)).toHaveLength(4);
    expect(xml.match(/<triangle /g)).toHaveLength(2);
  });

  it('escapes characters that would otherwise break the XML', () => {
    const xml = model(unzipSync(buildThreeMf([{ name: 'A & B <"quoted">', color: '#000000', mesh: triangle }])));
    expect(xml).toContain('name="A &amp; B &lt;&quot;quoted&quot;&gt;"');
  });
});

describe('3MF container validity', () => {
  /** DOMParser (via happy-dom) reports malformed XML as a <parsererror> node instead of throwing. */
  function parseXml(xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const error = doc.querySelector('parsererror');
    if (error) throw new Error(`XML did not parse: ${error.textContent}`);
    return doc;
  }

  it('every part is well-formed XML', () => {
    const zip = unzipSync(
      buildThreeMf([
        { name: 'Body', color: '#B4B4B4', mesh: triangle },
        { name: 'Letters', color: '#1D9BF0', mesh: triangle },
      ]),
    );
    parseXml(strFromU8(zip['[Content_Types].xml']));
    parseXml(strFromU8(zip['_rels/.rels']));
    parseXml(strFromU8(zip['3D/3dmodel.model']));
  });

  it('the relationship part points at the model part 3D/3dmodel.model', () => {
    const zip = unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: triangle }]));
    const doc = parseXml(strFromU8(zip['_rels/.rels']));
    const rel = doc.querySelector('Relationship');
    expect(rel?.getAttribute('Target')).toBe('/3D/3dmodel.model');
    expect(rel?.getAttribute('Type')).toBe('http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel');
  });

  it('content types declares the model extension so a reader knows how to open it', () => {
    const zip = unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: triangle }]));
    const doc = parseXml(strFromU8(zip['[Content_Types].xml']));
    const modelType = [...doc.querySelectorAll('Default')].find((el) => el.getAttribute('Extension') === 'model');
    expect(modelType?.getAttribute('ContentType')).toBe('application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
  });

  it('every triangle references a vertex index that actually exists, for every part', () => {
    // A closed tetrahedron: 4 faces, 4 distinct vertices, no degeneracies.
    const tetrahedron: Mesh = {
      positions: new Float32Array([
        // face 1
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        // face 2
        0, 0, 0, 0, 0, 1, 1, 0, 0,
        // face 3
        0, 0, 0, 0, 1, 0, 0, 0, 1,
        // face 4
        1, 0, 0, 0, 0, 1, 0, 1, 0,
      ]),
      triangleCount: 4,
    };
    const zip = unzipSync(
      buildThreeMf([
        { name: 'Body', color: '#B4B4B4', mesh: tetrahedron },
        { name: 'Letters', color: '#1D9BF0', mesh: tetrahedron },
      ]),
    );
    const doc = parseXml(strFromU8(zip['3D/3dmodel.model']));
    const objects = [...doc.querySelectorAll('object')];
    expect(objects).toHaveLength(2);
    for (const object of objects) {
      const vertexCount = object.querySelectorAll('vertex').length;
      expect(vertexCount).toBe(4);
      for (const tri of [...object.querySelectorAll('triangle')]) {
        for (const attr of ['v1', 'v2', 'v3']) {
          const index = Number(tri.getAttribute(attr));
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(vertexCount);
        }
      }
    }
  });

  it('drops a degenerate triangle without corrupting the vertex indices of the triangles around it', () => {
    // Triangle 0 is a genuine face; triangle 1 repeats one of its own corners (zero area);
    // triangle 2 is another genuine face sharing an edge with triangle 0.
    const mesh: Mesh = {
      positions: new Float32Array([
        // triangle 0: real face
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        // triangle 1: degenerate (first two corners identical)
        0, 0, 0, 0, 0, 0, 0, 1, 0,
        // triangle 2: real face, shares an edge with triangle 0
        1, 0, 0, 1, 1, 0, 0, 1, 0,
      ]),
      triangleCount: 3,
    };
    const zip = unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh }]));
    const doc = parseXml(strFromU8(zip['3D/3dmodel.model']));
    const object = doc.querySelector('object');
    // 3 distinct vertex positions across the two real triangles, plus the extra corner from
    // triangle 2 = 4 distinct positions; the degenerate triangle introduces no new position.
    expect(object?.querySelectorAll('vertex')).toHaveLength(4);
    // Only the two real triangles survive.
    expect(object?.querySelectorAll('triangle')).toHaveLength(2);
    const vertexCount = object?.querySelectorAll('vertex').length ?? 0;
    for (const tri of [...(object?.querySelectorAll('triangle') ?? [])]) {
      for (const attr of ['v1', 'v2', 'v3']) {
        const index = Number(tri.getAttribute(attr));
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(vertexCount);
      }
    }
  });

  it('never emits a vertex coordinate in scientific notation', () => {
    // Float32 noise near zero (e.g. from a CSG boolean) prints as scientific notation via plain
    // string interpolation — `${1e-8}` is `"1e-8"`, which is a legal XSD double but a real risk
    // for the lenient float parsers used by real-world slicer 3MF readers. The emitted vertex
    // must use the same fixed-point precision the vertex was deduped under instead.
    const noisyMesh: Mesh = {
      positions: new Float32Array([1e-8, -1e-9, 0, 1, 0, 0, 0, 1, 0]),
      triangleCount: 1,
    };
    const xml = model(unzipSync(buildThreeMf([{ name: 'Body', color: '#B4B4B4', mesh: noisyMesh }])));
    const vertexTags = xml.match(/<vertex[^/]*\/>/g) ?? [];
    expect(vertexTags.length).toBeGreaterThan(0);
    for (const tag of vertexTags) {
      expect(tag).not.toMatch(/e[+-]/i);
    }
    expect(xml).toContain('<vertex x="0.0000" y="-0.0000" z="0.0000" />');
  });
});

describe('toFileSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toFileSlug('Laser Cutter 2')).toBe('laser-cutter-2');
  });

  it('falls back when the label has no usable characters', () => {
    expect(toFileSlug('!!!')).toBe('nfc-keychain-card');
  });

  it('does not leave a trailing hyphen when truncation lands right after one', () => {
    // 40 'a's, then a run of separator characters that collapse to a single hyphen landing
    // exactly at the 40-character truncation boundary.
    const label = `${'a'.repeat(40)}   overflow`;
    const slug = toFileSlug(label);
    expect(slug).toBe('a'.repeat(40));
    expect(slug.endsWith('-')).toBe(false);
  });
});
