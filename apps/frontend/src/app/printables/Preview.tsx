import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BODY_COLOR, LETTER_COLOR } from './download';
import type { Mesh } from './stl';

interface PreviewProps {
  body: Mesh;
  /** The second part, drawn in the accent colour: the card's letters or the plug cover. */
  accent: Mesh;
  /** Accessible name for the canvas container; the canvas itself has no text content. */
  ariaLabel: string;
}

/**
 * `mesh.positions` always comes from `parseBinaryStl`, which allocates its own `Float32Array`
 * and copies values into it float-by-float via `DataView` reads — it never views the incoming
 * STL `ArrayBuffer` directly. So `mesh.positions` is already a freshly owned array; wrapping it
 * in another `new Float32Array(...)` here would just be a redundant copy on every render.
 */
export function toGeometry(mesh: Mesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Removes `group`'s meshes from `scene` and disposes their geometries and materials. Exported so
 * disposal can be exercised in tests without standing up a `WebGLRenderer` (which happy-dom
 * cannot provide) — a `THREE.Scene`/`THREE.Mesh` graph needs no GL context to build or tear down.
 */
export function disposeMeshGroup(scene: THREE.Scene, group: THREE.Mesh[]): void {
  for (const mesh of group) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

/** Vertical field of view of the preview camera, in degrees. */
const FOV = 35;
/** Where the camera starts, looking at the origin from the front and above. */
const CAMERA_START = new THREE.Vector3(0, -90, 70);

/**
 * Bounds of all parts together. Models are built wherever their .scad puts them (the card in the
 * first octant, the plug cover around the z axis), so the preview centres on these instead of on
 * a per-model constant.
 */
export function partsBounds(geometries: THREE.BufferGeometry[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  return bounds;
}

/**
 * Camera distance at which the bounds' enclosing sphere fills the view height. Never closer than
 * the starting distance, which suits the keychain card.
 */
export function fitDistance(bounds: THREE.Box3): number {
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  return Math.max(CAMERA_START.length(), radius / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
}

export function Preview({ body, accent, ariaLabel }: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Scene setup runs once; only the geometry changes as the label is edited.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1000);
    camera.position.copy(CAMERA_START);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(40, -60, 80);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-50, 40, -30);
    scene.add(fill);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      // Let three write canvas.style width/height too (updateStyle defaults to true). Passing
      // `false` would only be correct if something else sized the canvas in CSS — nothing does:
      // the canvas is appended raw with no class, styles.css has no canvas rule, and Tailwind
      // preflight scopes max-width to img/video. Combined with setPixelRatio above, the canvas
      // would then lay out at devicePixelRatio× its container and overflow on any HiDPI display.
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      // `dispose()` alone frees GPU-side buffers but does not release the WebGL context
      // itself (three r185); without `forceContextLoss()` every mount leaks a context, and
      // Chrome starts logging "Too many active WebGL contexts" after ~16 of them.
      renderer.forceContextLoss();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Rebuilds the mesh pair whenever the STL data changes, and only then: the dependencies are the
  // two meshes, which keep their identity until a new render replaces them. The cleanup below
  // disposes exactly the group this run created (captured by closure, not read back from a ref), so it fires both when
  // swapping to a newer pair and on unmount — no pair is ever left undisposed, and because each
  // run's cleanup only ever touches its own group, two runs can never dispose the same objects.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const bodyGeometry = toGeometry(body);
    const accentGeometry = toGeometry(accent);
    const group: THREE.Mesh[] = [
      new THREE.Mesh(
        bodyGeometry,
        new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.75, metalness: 0 }),
      ),
      new THREE.Mesh(
        accentGeometry,
        new THREE.MeshStandardMaterial({ color: LETTER_COLOR, roughness: 0.55, metalness: 0 }),
      ),
    ];

    // Centre the assembly on the origin so it orbits about itself, and back the camera off far
    // enough to see all of it, keeping whatever angle the user has rotated to.
    const bounds = partsBounds([bodyGeometry, accentGeometry]);
    const center = bounds.getCenter(new THREE.Vector3()).negate();
    for (const mesh of group) {
      mesh.position.copy(center);
      scene.add(mesh);
    }
    cameraRef.current?.position.setLength(fitDistance(bounds));

    return () => disposeMeshGroup(scene, group);
  }, [body, accent]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className="h-80 w-full" />;
}
