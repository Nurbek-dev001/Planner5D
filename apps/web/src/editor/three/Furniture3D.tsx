import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { CatalogItem, PlacedObject } from '@spaceplan/shared';
import { materialFor, plainMaterial, worldUVs } from './materials';
import { GltfFurniture } from './GltfFurniture';

/**
 * Procedural low-poly furniture (docs, section 12) built from primitives and the object's
 * actual dimensions. Local frame: X = width, Y = up (from the object's bottom), Z = depth,
 * back of the object at -Z. Items with `CatalogItem.modelUrl` render the real GLB model instead,
 * with the procedural one as the loading / error fallback.
 */

const boxGeoCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number) {
  const key = `${w.toFixed(1)}|${h.toFixed(1)}|${d.toFixed(1)}`;
  let g = boxGeoCache.get(key);
  if (!g) {
    g = worldUVs(new THREE.BoxGeometry(Math.max(w, 0.1), Math.max(h, 0.1), Math.max(d, 0.1))) as THREE.BoxGeometry;
    boxGeoCache.set(key, g);
  }
  return g;
}

interface BoxProps {
  /** size */
  s: [number, number, number];
  /** centre position */
  p: [number, number, number];
  m: THREE.Material;
  r?: [number, number, number];
}

const Box = ({ s, p, m, r }: BoxProps) => <mesh geometry={boxGeo(...s)} position={p} rotation={r} material={m} castShadow receiveShadow />;

const Cyl = ({ r, h, p, m, top }: { r: number; h: number; p: [number, number, number]; m: THREE.Material; top?: number }) => (
  <mesh position={p} material={m} castShadow receiveShadow>
    <cylinderGeometry args={[top ?? r, r, h, 24]} />
  </mesh>
);

export function Furniture3D({ obj, item }: { obj: PlacedObject; item: CatalogItem | undefined }) {
  const procedural = <ProceduralFurniture obj={obj} item={item} />;
  if (!item?.modelUrl) return procedural;
  return <GltfFurniture url={item.modelUrl} w={obj.width} h={obj.height} d={obj.depth} fallback={procedural} />;
}

function ProceduralFurniture({ obj, item }: { obj: PlacedObject; item: CatalogItem | undefined }) {
  const kind = item?.model ?? 'desk';
  const { width: w, depth: d, height: h } = obj;
  const color = obj.color ?? item?.color ?? '#999999';
  const main = materialFor(obj.materialId, color, color);
  const dark = plainMaterial('#3a3a3c', { roughness: 0.5 });
  const metal = plainMaterial('#c6c8cb', { metalness: 0.85, roughness: 0.3 });
  const white = plainMaterial('#f7f7f5', { roughness: 0.25 });
  const wood = materialFor('furn-wood-oak');
  const glass = plainMaterial('#cfe3ea', { transparent: true, opacity: 0.3, roughness: 0.05 });
  const lightOn = obj.lightOn !== false;
  const glow = plainMaterial('#fff4d6', { emissive: new THREE.Color('#ffdf9e'), emissiveIntensity: lightOn ? 2 : 0 });

  const parts: ReactNode = useMemo(() => {
    const hx = w / 2;
    const hz = d / 2;
    const legs = (legH: number, t = 4, inset = 4, m: THREE.Material = dark) =>
      [
        [-hx + inset, -hz + inset],
        [hx - inset, -hz + inset],
        [-hx + inset, hz - inset],
        [hx - inset, hz - inset],
      ].map(([x, z], i) => <Box key={`leg${i}`} s={[t, legH, t]} p={[x, legH / 2, z]} m={m} />);

    switch (kind) {
      case 'sofa':
      case 'armchair': {
        const arm = Math.min(w * 0.15, 20);
        const seatH = h * 0.48;
        return (
          <>
            <Box s={[w, seatH - 12, d]} p={[0, (seatH - 12) / 2 + 6, 0]} m={main} />
            <Box s={[w - 2 * arm - 2, 12, d * 0.72]} p={[0, seatH - 6, hz - d * 0.36]} m={main} />
            <Box s={[w, h - 6, d * 0.25]} p={[0, (h - 6) / 2 + 6, -hz + d * 0.125]} m={main} />
            <Box s={[arm, h * 0.68, d]} p={[-hx + arm / 2, h * 0.34 + 3, 0]} m={main} />
            <Box s={[arm, h * 0.68, d]} p={[hx - arm / 2, h * 0.34 + 3, 0]} m={main} />
            {legs(6, 4, 6)}
          </>
        );
      }
      case 'corner-sofa': {
        const sd = Math.min(95, w / 2, d / 2);
        const seatH = h * 0.48;
        return (
          <>
            <Box s={[w, seatH, sd]} p={[0, seatH / 2, -hz + sd / 2]} m={main} />
            <Box s={[sd, seatH, d - sd]} p={[-hx + sd / 2, seatH / 2, sd / 2]} m={main} />
            <Box s={[w, h, sd * 0.25]} p={[0, h / 2, -hz + sd * 0.125]} m={main} />
            <Box s={[sd * 0.25, h, d]} p={[-hx + sd * 0.125, h / 2, 0]} m={main} />
            <Box s={[18, h * 0.65, sd]} p={[hx - 9, h * 0.325, -hz + sd / 2]} m={main} />
          </>
        );
      }
      case 'bed': {
        const frameH = 30;
        const pillows = w > 120 ? 2 : 1;
        const pw = (w - 20) / pillows;
        return (
          <>
            <Box s={[w, frameH, d]} p={[0, frameH / 2, 0]} m={main} />
            <Box s={[w - 6, 22, d - 12]} p={[0, frameH + 11, 4]} m={white} />
            <Box s={[w - 4, 4, d * 0.62]} p={[0, frameH + 23, hz - d * 0.31 - 2]} m={plainMaterial('#cbd5e1', { roughness: 1 })} />
            <Box s={[w, h, 8]} p={[0, h / 2, -hz + 4]} m={main} />
            {Array.from({ length: pillows }, (_, i) => (
              <Box key={i} s={[pw - 8, 12, 30]} p={[-hx + 10 + pw * i + pw / 2, frameH + 28, -hz + 30]} m={white} />
            ))}
          </>
        );
      }
      case 'dining-table':
      case 'coffee-table':
      case 'desk':
        return (
          <>
            <Box s={[w, 4, d]} p={[0, h - 2, 0]} m={main} />
            {legs(h - 4, kind === 'coffee-table' ? 5 : 4, 5)}
          </>
        );
      case 'round-table':
        return (
          <>
            <Cyl r={w / 2} h={4} p={[0, h - 2, 0]} m={main} />
            <Cyl r={4} h={h - 4} p={[0, (h - 4) / 2, 0]} m={dark} />
            <Cyl r={w / 5} h={3} p={[0, 1.5, 0]} m={dark} />
          </>
        );
      case 'chair':
        return (
          <>
            <Box s={[w, 5, d * 0.85]} p={[0, 45, hz - d * 0.425]} m={main} />
            <Box s={[w, h - 48, 4]} p={[0, 48 + (h - 48) / 2, -hz + 4]} m={main} />
            {legs(43, 3.5, 3)}
          </>
        );
      case 'office-chair':
        return (
          <>
            <Box s={[w * 0.8, 8, d * 0.75]} p={[0, 48, 4]} m={main} />
            <Box s={[w * 0.75, h - 58, 6]} p={[0, 58 + (h - 58) / 2, -hz + 8]} m={main} />
            <Cyl r={2.5} h={40} p={[0, 22, 0]} m={metal} />
            <Cyl r={w * 0.4} h={3} p={[0, 3, 0]} m={dark} top={w * 0.1} />
          </>
        );
      case 'wardrobe':
      case 'dresser':
      case 'nightstand':
      case 'tv-stand':
      case 'kitchen-wall': {
        const doors = Math.max(1, Math.round(w / 50));
        const rows = kind === 'dresser' ? 4 : kind === 'nightstand' ? 2 : 1;
        return (
          <>
            <Box s={[w, h, d]} p={[0, h / 2, 0]} m={main} />
            {Array.from({ length: doors - 1 }, (_, i) => (
              <Box key={`v${i}`} s={[0.6, h - 4, 0.6]} p={[-hx + (w / doors) * (i + 1), h / 2, hz + 0.2]} m={dark} />
            ))}
            {Array.from({ length: rows - 1 }, (_, i) => (
              <Box key={`h${i}`} s={[w - 4, 0.6, 0.6]} p={[0, (h / rows) * (i + 1), hz + 0.2]} m={dark} />
            ))}
            {Array.from({ length: doors }, (_, i) => (
              <Box key={`k${i}`} s={[2, rows > 1 ? 2 : 14, 2]} p={[-hx + (w / doors) * (i + 0.5) + (rows > 1 ? 0 : 8), rows > 1 ? h - h / rows / 2 : h * 0.55, hz + 1.5]} m={metal} />
            ))}
          </>
        );
      }
      case 'bookshelf': {
        const shelves = Math.max(2, Math.round(h / 38));
        return (
          <>
            <Box s={[2, h, d]} p={[-hx + 1, h / 2, 0]} m={main} />
            <Box s={[2, h, d]} p={[hx - 1, h / 2, 0]} m={main} />
            <Box s={[w, h, 1]} p={[0, h / 2, -hz + 0.5]} m={main} />
            {Array.from({ length: shelves + 1 }, (_, i) => (
              <Box key={i} s={[w - 4, 2, d - 1]} p={[0, 1 + ((h - 2) / shelves) * i, 0.5]} m={main} />
            ))}
            {Array.from({ length: shelves }, (_, i) => (
              <Box
                key={`b${i}`}
                s={[w * 0.5, Math.min(26, h / shelves - 8), d * 0.7]}
                p={[-w * 0.15 + (i % 2) * w * 0.2, 2 + ((h - 2) / shelves) * i + Math.min(26, h / shelves - 8) / 2, 0]}
                m={plainMaterial(['#7f1d1d', '#1e3a8a', '#365314', '#78350f'][i % 4])}
              />
            ))}
          </>
        );
      }
      case 'kitchen-base':
      case 'sink-cabinet':
        return (
          <>
            <Box s={[w, h - 4, d - 2]} p={[0, (h - 4) / 2, -1]} m={main} />
            <Box s={[w, 4, d]} p={[0, h - 2, 0]} m={plainMaterial('#6b6b6b', { roughness: 0.35 })} />
            <Box s={[w - 4, 2, 2]} p={[0, h - 14, hz - 1]} m={metal} />
            {kind === 'sink-cabinet' && (
              <>
                <Box s={[w * 0.55, 1, d * 0.5]} p={[0, h + 0.1, 0]} m={metal} />
                <Cyl r={1.5} h={25} p={[0, h + 12, -hz + 8]} m={metal} />
              </>
            )}
          </>
        );
      case 'fridge':
        return (
          <>
            <Box s={[w, h, d]} p={[0, h / 2, 0]} m={main} />
            <Box s={[w - 2, 0.8, 0.8]} p={[0, h * 0.62, hz + 0.3]} m={dark} />
            <Box s={[2, 30, 3]} p={[hx - 6, h * 0.75, hz + 1.5]} m={dark} />
            <Box s={[2, 30, 3]} p={[hx - 6, h * 0.45, hz + 1.5]} m={dark} />
          </>
        );
      case 'stove':
        return (
          <>
            <Box s={[w, h - 2, d]} p={[0, (h - 2) / 2, 0]} m={main} />
            <Box s={[w, 2, d]} p={[0, h - 1, 0]} m={dark} />
            <Box s={[w - 10, h * 0.45, 1]} p={[0, h * 0.35, hz + 0.3]} m={dark} />
            {[
              [-w / 4, -d / 4],
              [w / 4, -d / 4],
              [-w / 4, d / 4],
              [w / 4, d / 4],
            ].map(([x, z], i) => (
              <Cyl key={i} r={Math.min(w, d) * 0.12} h={0.6} p={[x, h + 0.3, z]} m={plainMaterial('#111111')} />
            ))}
          </>
        );
      case 'washing-machine':
        return (
          <>
            <Box s={[w, h, d]} p={[0, h / 2, 0]} m={main} />
            <mesh position={[0, h * 0.45, hz + 0.5]} rotation={[Math.PI / 2, 0, 0]} material={glass}>
              <cylinderGeometry args={[Math.min(w, h) * 0.3, Math.min(w, h) * 0.3, 1, 32]} />
            </mesh>
          </>
        );
      case 'bathtub':
        return (
          <>
            <Box s={[w, h, d]} p={[0, h / 2, 0]} m={main} />
            <Box s={[w - 14, 1, d - 14]} p={[0, h - 0.3, 0]} m={plainMaterial('#dfe8ec', { roughness: 0.1 })} />
          </>
        );
      case 'shower':
        return (
          <>
            <Box s={[w, 8, d]} p={[0, 4, 0]} m={white} />
            <Box s={[w, h - 8, d]} p={[0, 8 + (h - 8) / 2, 0]} m={glass} />
            <Cyl r={10} h={2} p={[0, h - 20, -hz + 20]} m={metal} />
          </>
        );
      case 'washbasin':
        return (
          <>
            <Box s={[w, h - 12, d - 2]} p={[0, 20 + (h - 32) / 2, -1]} m={main} />
            <Box s={[w, 12, d]} p={[0, h - 6, 0]} m={white} />
            <Cyl r={1.5} h={20} p={[0, h + 10, -hz + 8]} m={metal} />
            <Box s={[w, 1, 3]} p={[0, h + 50, -hz + 1.5]} m={plainMaterial('#dbeafe', { metalness: 0.9, roughness: 0.05 })} />
          </>
        );
      case 'toilet':
        return (
          <>
            <Box s={[w, h - 38, d * 0.28]} p={[0, 38 + (h - 38) / 2, -hz + d * 0.14]} m={white} />
            <mesh position={[0, 20, hz - d * 0.4]} scale={[w / 2, 20, d * 0.36]} material={white} castShadow>
              <cylinderGeometry args={[1, 0.75, 2, 24]} />
            </mesh>
          </>
        );
      case 'plant':
        return (
          <>
            <Cyl r={Math.min(w, d) * 0.28} h={h * 0.3} p={[0, h * 0.15, 0]} m={plainMaterial('#d6cfc4')} top={Math.min(w, d) * 0.33} />
            <mesh position={[0, h * 0.62, 0]} scale={[w / 2, h * 0.38, d / 2]} material={plainMaterial(color, { roughness: 0.9 })} castShadow>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
          </>
        );
      case 'rug':
        return w !== d ? (
          <Box s={[w, Math.max(h, 1), d]} p={[0, Math.max(h, 1) / 2, 0]} m={plainMaterial(color, { roughness: 1 })} />
        ) : (
          <Cyl r={w / 2} h={Math.max(h, 1)} p={[0, Math.max(h, 1) / 2, 0]} m={plainMaterial(color, { roughness: 1 })} />
        );
      case 'mirror':
      case 'painting':
        return (
          <>
            <Box s={[w, h, d]} p={[0, h / 2, 0]} m={kind === 'mirror' ? metal : wood} />
            <Box
              s={[w - 6, h - 6, 0.5]}
              p={[0, h / 2, d / 2 + 0.1]}
              m={kind === 'mirror' ? plainMaterial('#e5f0f5', { metalness: 1, roughness: 0.02 }) : plainMaterial(color, { roughness: 0.8 })}
            />
          </>
        );
      case 'tv':
        return (
          <>
            <Box s={[w, h, Math.max(d, 3)]} p={[0, h / 2, 0]} m={plainMaterial('#111114', { roughness: 0.2 })} />
            <Box s={[w - 4, h - 4, 0.3]} p={[0, h / 2, Math.max(d, 3) / 2]} m={plainMaterial('#1e293b', { roughness: 0.05, metalness: 0.4 })} />
          </>
        );
      case 'computer':
        return (
          <>
            <Box s={[w, h * 0.72, 3]} p={[0, h * 0.28 + h * 0.36, 0]} m={plainMaterial('#111114', { roughness: 0.2 })} />
            <Box s={[4, h * 0.3, 4]} p={[0, h * 0.15, -2]} m={metal} />
            <Box s={[w * 0.35, 1, d * 0.8]} p={[0, 0.5, 0]} m={metal} />
          </>
        );
      case 'ceiling-light':
        return (
          <>
            <Cyl r={4} h={h * 0.5} p={[0, h * 0.75, 0]} m={metal} />
            <mesh position={[0, h * 0.35, 0]} material={glow}>
              <sphereGeometry args={[Math.min(w, d) / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </>
        );
      case 'floor-lamp':
        return (
          <>
            <Cyl r={w * 0.35} h={3} p={[0, 1.5, 0]} m={dark} />
            <Cyl r={1.5} h={h - 30} p={[0, (h - 30) / 2, 0]} m={dark} />
            <Cyl r={w / 2} h={30} p={[0, h - 15, 0]} m={glow} top={w / 3} />
          </>
        );
      case 'wall-lamp':
        return (
          <>
            <Box s={[8, 12, 3]} p={[0, h / 2, -hz + 1.5]} m={metal} />
            <Cyl r={w / 2} h={h * 0.6} p={[0, h / 2, 0]} m={glow} top={w / 3} />
          </>
        );
      default:
        return <Box s={[w, h, d]} p={[0, h / 2, 0]} m={main} />;
    }
  }, [kind, w, d, h, main, glow]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{parts}</>;
}

/** Point light position (local) for light-emitting catalog items */
export function lightOffset(item: CatalogItem, obj: PlacedObject): [number, number, number] {
  if (item.model === 'ceiling-light') return [0, obj.height * 0.2, 0];
  if (item.model === 'floor-lamp') return [0, obj.height - 20, 0];
  return [0, obj.height / 2, 10];
}
