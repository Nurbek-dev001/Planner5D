import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/** Catalog model URLs are relative to the app's base URL (works for the static demo build too) */
export function resolveModelUrl(url: string) {
  return /^(https?:|data:|blob:)/.test(url) ? url : `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`;
}

const floatGeometries = new WeakSet<THREE.BufferGeometry>();

/**
 * The optimized models store quantized (normalized Int16/Int8, interleaved) vertex data.
 * The GPU path tracer merges all geometry into one BVH and needs plain Float32 attributes,
 * so they are expanded once per loaded geometry (shared by every placed copy).
 */
function toFloatAttributes(root: THREE.Object3D) {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!(o as THREE.Mesh).isMesh || !g || floatGeometries.has(g)) return;
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name];
      if (a.array instanceof Float32Array && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !a.normalized) continue;
      const out = new THREE.BufferAttribute(new Float32Array(a.count * a.itemSize), a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out.setComponent(i, c, a.getComponent(i, c));
      g.setAttribute(name, out);
    }
    floatGeometries.add(g);
  });
}

/**
 * A real GLB model fitted into the object's box: centred on X/Z, standing on Y = 0 and scaled to
 * width × height × depth (cm), so resizing in the editor works the same as for procedural models.
 */
function FittedModel({ url, w, h, d }: { url: string; w: number; h: number; d: number }) {
  // No Draco (decoder would come from a CDN); meshopt is decoded locally
  const { scene } = useGLTF(url, false, true);
  const object = useMemo(() => {
    toFloatAttributes(scene);
    const root = scene.clone(true);
    const lights: THREE.Object3D[] = [];
    root.traverse((o) => {
      if ((o as THREE.Light).isLight) lights.push(o);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Lamps ship their own punctual lights in physical units; the editor adds its own light instead
    lights.forEach((l) => l.removeFromParent());
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    const fitted = new THREE.Group();
    fitted.add(root);
    fitted.scale.set(w / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6), d / Math.max(size.z, 1e-6));
    return fitted;
  }, [scene, w, h, d]);
  return <primitive object={object} />;
}

/** Falls back to the procedural model if the GLB cannot be loaded (offline, missing file) */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('3D model failed to load, using procedural fallback', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GltfFurniture({ url, w, h, d, fallback }: { url: string; w: number; h: number; d: number; fallback: ReactNode }) {
  return (
    <ModelBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <FittedModel url={resolveModelUrl(url)} w={w} h={h} d={d} />
      </Suspense>
    </ModelBoundary>
  );
}
