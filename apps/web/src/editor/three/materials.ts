import * as THREE from 'three';
import { MATERIALS_BY_ID, type Material as SpMaterial } from '@spaceplan/shared';
import { textureFor } from './textures';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Three.js material for a library material, optionally re-coloured.
 * Geometry UVs are expected in centimetres (see `worldUVs`), so the texture repeat is 1/scale.
 */
export function materialFor(materialId: string | undefined, color?: string, fallback = '#cccccc'): THREE.MeshStandardMaterial {
  const sp: SpMaterial | undefined = materialId ? MATERIALS_BY_ID[materialId] : undefined;
  const key = `${materialId ?? '-'}|${color ?? '-'}|${fallback}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let mat: THREE.MeshStandardMaterial;
  if (sp) {
    const useTexture = !color || color.toLowerCase() === sp.baseColor.toLowerCase();
    const tex = useTexture ? textureFor(sp) : null;
    if (tex) {
      tex.repeat.set(1 / sp.scale, 1 / sp.scale);
    }
    mat = new THREE.MeshStandardMaterial({
      color: tex ? '#ffffff' : (color ?? sp.baseColor),
      map: tex ?? null,
      roughness: sp.roughness,
      metalness: sp.metallic,
      transparent: sp.id === 'furn-glass',
      opacity: sp.id === 'furn-glass' ? 0.35 : 1,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: color ?? fallback, roughness: 0.7, metalness: 0 });
  }
  cache.set(key, mat);
  return mat;
}

export function plainMaterial(color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `plain|${color}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
  cache.set(key, m);
  return m;
}

/** Replace a box geometry's UVs with planar world-space (cm) coordinates per face */
export function worldUVs(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (nx >= ny && nx >= Math.abs(nrm.getZ(i))) uv.setXY(i, z, y);
    else if (ny >= Math.abs(nrm.getZ(i))) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geo;
}
