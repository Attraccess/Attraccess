import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeMeshGroup, fitDistance, partsBounds, toGeometry } from './Preview';
import type { Mesh } from './stl';
import { BODY_COLOR } from './download';

/** Two triangles sharing an edge, flat in the XY plane, wound counter-clockwise (viewed from +Z). */
function twoTriangleMesh(): Mesh {
  return {
    positions: new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0, // triangle 1
      1,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      0, // triangle 2
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

describe('partsBounds', () => {
  it('includes a part that reaches beyond the first one', () => {
    const body = toGeometry({ positions: new Float32Array([-10, -10, 0, 10, 10, 0, 0, 0, 20]), triangleCount: 1 });
    const cover = toGeometry({ positions: new Float32Array([-5, -5, 30, 5, 5, 30, 0, 0, 40]), triangleCount: 1 });
    const bounds = partsBounds([body, cover]);
    expect(bounds.max.z).toBe(40);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBe(20);
  });

  it('spans every part, so the preview centres on the real assembly', () => {
    const body = toGeometry({
      positions: new Float32Array([-27, -27, -0.8, 27, 27, -0.8, 0, 0, 60.8]),
      triangleCount: 1,
    });
    const cover = toGeometry({ positions: new Float32Array([-23, -23, 43, 23, 23, 43, 0, 0, 60.8]), triangleCount: 1 });
    const bounds = partsBounds([body, cover]);
    expect(bounds.min.z).toBeCloseTo(-0.8, 5);
    expect(
      bounds
        .getCenter(new THREE.Vector3())
        .toArray()
        .map((v) => Number(v.toFixed(3))),
    ).toEqual([0, 0, 30]);
  });
});

describe('fitDistance', () => {
  it('never moves closer than the starting distance', () => {
    const card = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(60, 40, 2));
    expect(fitDistance(card)).toBeGreaterThanOrEqual(Math.hypot(90, 70));
    expect(fitDistance(new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)))).toBeCloseTo(
      Math.hypot(90, 70),
      5,
    );
  });

  it('backs off for a taller model so all of it stays in view', () => {
    const cover = new THREE.Box3(new THREE.Vector3(-27, -27, -0.8), new THREE.Vector3(27, 27, 60.8));
    expect(fitDistance(cover)).toBeGreaterThan(150);
  });
});
