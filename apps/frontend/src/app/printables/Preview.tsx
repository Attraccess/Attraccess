import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BODY_COLOR, LETTER_COLOR } from './download';
import type { Mesh } from './stl';

interface PreviewProps {
  body: Mesh;
  letters: Mesh;
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

export function Preview({ body, letters }: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // Scene setup runs once; only the geometry changes as the label is edited.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, 1, 1, 1000);
    camera.position.set(0, -90, 70);

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
      renderer.setSize(clientWidth, clientHeight, false);
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
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    for (const mesh of meshesRef.current) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    // The card is modelled in the first octant; centre it so it orbits about itself.
    const group: THREE.Mesh[] = [
      new THREE.Mesh(
        toGeometry(body),
        new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.75, metalness: 0 })
      ),
      new THREE.Mesh(
        toGeometry(letters),
        new THREE.MeshStandardMaterial({ color: LETTER_COLOR, roughness: 0.55, metalness: 0 })
      ),
    ];

    for (const mesh of group) {
      mesh.position.set(-30, -20, -1);
      scene.add(mesh);
    }

    meshesRef.current = group;
  }, [body, letters]);

  return <div ref={containerRef} className="h-80 w-full" />;
}
