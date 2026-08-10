export interface Mesh {
  /** Nine floats per triangle: x,y,z for each of three vertices. */
  positions: Float32Array;
  triangleCount: number;
}

const HEADER_BYTES = 84;
const TRIANGLE_BYTES = 50;

/** Parses a binary STL. OpenSCAD is invoked with `--export-format binstl`, so ASCII is not handled. */
export function parseBinaryStl(buffer: ArrayBuffer): Mesh {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error(`STL too short: ${buffer.byteLength} bytes`);
  }

  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const expected = HEADER_BYTES + triangleCount * TRIANGLE_BYTES;
  if (buffer.byteLength < expected) {
    throw new Error(`STL truncated: ${triangleCount} triangles need ${expected} bytes, got ${buffer.byteLength}`);
  }

  const positions = new Float32Array(triangleCount * 9);
  for (let t = 0; t < triangleCount; t++) {
    // Skip the 12-byte normal; we recompute normals for display.
    const offset = HEADER_BYTES + t * TRIANGLE_BYTES + 12;
    for (let i = 0; i < 9; i++) {
      positions[t * 9 + i] = view.getFloat32(offset + i * 4, true);
    }
  }

  return { positions, triangleCount };
}

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
