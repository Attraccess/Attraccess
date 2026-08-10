import { describe, expect, it } from 'vitest';
import { toGeometry } from './Preview';
import type { Mesh } from './stl';

/** Two triangles sharing an edge, flat in the XY plane. */
function twoTriangleMesh(): Mesh {
  return {
    positions: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, // triangle 1
      1, 0, 0, 1, 1, 0, 0, 1, 0, // triangle 2
    ]),
    triangleCount: 2,
  };
}

describe('toGeometry', () => {
  it('produces a position attribute with itemSize 3 and the expected vertex count', () => {
    const geometry = toGeometry(twoTriangleMesh());
    const position = geometry.getAttribute('position');
    expect(position.itemSize).toBe(3);
    expect(position.count).toBe(6);
  });

  it('computes vertex normals', () => {
    const geometry = toGeometry(twoTriangleMesh());
    const normal = geometry.getAttribute('normal');
    expect(normal).toBeDefined();
    expect(normal.count).toBe(6);
  });
});
