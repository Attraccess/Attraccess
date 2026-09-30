import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeMeshGroup, toGeometry } from './Preview';
import type { Mesh } from './stl';
import { BODY_COLOR } from './download';

/** Two triangles sharing an edge, flat in the XY plane, wound counter-clockwise (viewed from +Z). */
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

  it('orients normals from winding order, not just their presence', () => {
    // Both triangles wind counter-clockwise around +Z, so every vertex normal must point +Z —
    // this would flip to -Z (or go inconsistent) if a caller silently reversed winding order.
    const geometry = toGeometry(twoTriangleMesh());
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      expect(normal.getX(i)).toBeCloseTo(0);
      expect(normal.getY(i)).toBeCloseTo(0);
      expect(normal.getZ(i)).toBeCloseTo(1);
    }
  });
});

describe('disposeMeshGroup', () => {
  it('removes each mesh from the scene and disposes its geometry and material', () => {
    const scene = new THREE.Scene();
    const group = [
      new THREE.Mesh(toGeometry(twoTriangleMesh()), new THREE.MeshStandardMaterial({ color: BODY_COLOR })),
      new THREE.Mesh(toGeometry(twoTriangleMesh()), new THREE.MeshStandardMaterial({ color: BODY_COLOR })),
    ];
    for (const mesh of group) scene.add(mesh);

    const geometryDisposeSpies = group.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const materialDisposeSpies = group.map((mesh) => vi.spyOn(mesh.material as THREE.Material, 'dispose'));

    expect(scene.children).toHaveLength(2);

    disposeMeshGroup(scene, group);

    expect(scene.children).toHaveLength(0);
    for (const spy of [...geometryDisposeSpies, ...materialDisposeSpies]) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
