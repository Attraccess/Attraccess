import { describe, expect, it } from 'vitest';
import { boundingBox, parseBinaryStl } from './stl';

/** One triangle, as a minimal binary STL: 80-byte header, uint32 count, 50 bytes/triangle. */
function oneTriangleStl(): ArrayBuffer {
  const buf = new ArrayBuffer(84 + 50);
  const dv = new DataView(buf);
  dv.setUint32(80, 1, true);
  const verts = [0, 0, 0, 1, 0, 0, 0, 2, 3];
  verts.forEach((v, k) => dv.setFloat32(84 + 12 + k * 4, v, true));
  return buf;
}

describe('parseBinaryStl', () => {
  it('reads the triangle count and vertex positions', () => {
    const mesh = parseBinaryStl(oneTriangleStl());
    expect(mesh.triangleCount).toBe(1);
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 2, 3]);
  });

  it('computes a bounding box', () => {
    expect(boundingBox(parseBinaryStl(oneTriangleStl()))).toEqual({
      min: [0, 0, 0],
      max: [1, 2, 3],
    });
  });

  it('rejects a truncated buffer rather than reading past the end', () => {
    expect(() => parseBinaryStl(new ArrayBuffer(40))).toThrow(/too short/i);
  });

  it('rejects a buffer whose triangle count exceeds its length', () => {
    const buf = new ArrayBuffer(84 + 50);
    new DataView(buf).setUint32(80, 9999, true);
    expect(() => parseBinaryStl(buf)).toThrow(/truncated/i);
  });
});
