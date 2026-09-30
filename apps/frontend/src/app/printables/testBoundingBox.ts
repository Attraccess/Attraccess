import type { Mesh } from './stl';

/**
 * Test-only helper: no production code calls this (the app never needs a mesh's bounding box
 * at runtime), so it lives here rather than in stl.ts to keep it out of the lazy-loaded
 * /printables route chunk. Used by stl.spec.ts and nfc-keychain-card.spec.ts to assert on
 * rendered geometry.
 */
export function boundingBox(mesh: Mesh): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  return { min, max };
}
