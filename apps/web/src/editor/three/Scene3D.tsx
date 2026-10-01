import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  CATALOG_BY_ID,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  boundingBox,
  pointInPolygon,
  pointOnWall,
  roomInnerPolygon,
  samePoint,
  snapObjectToWall,
  wallDirection,
  wallLength,
  perp,
  add,
  scale as vscale,
  type Floor,
  type Opening,
  type PlacedObject,
  type ProjectData,
  type Room,
  type Wall,
} from '@spaceplan/shared';
import { useEditor } from '../store';
import { MoveObjectCommand } from '../commands';
import { materialFor, plainMaterial, worldUVs } from './materials';
import { Furniture3D, lightOffset } from './Furniture3D';
import { viewport } from '../viewport';
import { walkInput } from './walkInput';

const EYE_HEIGHT = 165;

// ------------------------------------------------------------------ walls

interface Piece {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Split a wall into solid boxes around its openings */
function wallPieces(length: number, height: number, openings: Opening[], ext0: number, ext1: number): Piece[] {
  const pieces: Piece[] = [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  let cursor = -ext0;
  for (const o of sorted) {
    const a = Math.max(0, o.offset - o.width / 2);
    const b = Math.min(length, o.offset + o.width / 2);
    if (a > cursor) pieces.push({ x0: cursor, x1: a, y0: 0, y1: height });
    if (o.elevation > 0) pieces.push({ x0: a, x1: b, y0: 0, y1: Math.min(o.elevation, height) });
    const top = o.elevation + o.height;
    if (top < height) pieces.push({ x0: a, x1: b, y0: top, y1: height });
    cursor = Math.max(cursor, b);
  }
  if (cursor < length + ext1) pieces.push({ x0: cursor, x1: length + ext1, y0: 0, y1: height });
  return pieces.filter((p) => p.x1 - p.x0 > 0.1 && p.y1 - p.y0 > 0.1);
}

function Wall3D({ wall, openings, walls, rooms }: { wall: Wall; openings: Opening[]; walls: Wall[]; rooms: Room[] }) {
  const L = wallLength(wall);
  const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
  const joined = (p: { x: number; y: number }) => walls.some((o) => o.id !== wall.id && (samePoint(o.start, p) || samePoint(o.end, p)));
  const ext0 = joined(wall.start) ? wall.thickness / 2 : 0;
  const ext1 = joined(wall.end) ? wall.thickness / 2 : 0;

  // Material per side: the room on that side can override the wall finish
  const sideMaterial = (sign: 1 | -1) => {
    const mid = pointOnWall(wall, L / 2);
    const probe = add(mid, vscale(perp(wallDirection(wall)), sign * (wall.thickness / 2 + 5)));
    const room = rooms.find((r) => pointInPolygon(probe, r.polygon));
    return materialFor(room?.wallMaterialId ?? wall.materialId ?? DEFAULT_WALL_MATERIAL);
  };
  const edge = plainMaterial('#e5e2dc', { roughness: 0.9 });
  const mats = [edge, edge, edge, edge, sideMaterial(1), sideMaterial(-1)];
  const geometries = useMemo(
    () =>
      wallPieces(L, wall.height, openings, ext0, ext1).map((p) => ({
        p,
        geo: worldUVs(new THREE.BoxGeometry(p.x1 - p.x0, p.y1 - p.y0, wall.thickness)),
      })),
    [L, wall.height, wall.thickness, openings, ext0, ext1],
  );
  useEffect(() => () => geometries.forEach((g) => g.geo.dispose()), [geometries]);

  return (
    <group position={[wall.start.x, 0, wall.start.y]} rotation={[0, -angle, 0]}>
      {geometries.map(({ p, geo }, i) => (
        <mesh
          key={i}
          position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0]}
          geometry={geo}
          material={mats}
          castShadow
          receiveShadow
        />
      ))}
      {openings.map((o) => (
        <group key={o.id} position={[o.offset, 0, 0]}>
          {o.kind === 'door' ? <Door3D o={o} t={wall.thickness} /> : <Window3D o={o} t={wall.thickness} />}
        </group>
      ))}
    </group>
  );
}

function Door3D({ o, t }: { o: Extract<Opening, { kind: 'door' }>; t: number }) {
  const frame = plainMaterial('#e8e4dc');
  const leafMat = o.type === 'glass' ? plainMaterial('#cfe3ea', { transparent: true, opacity: 0.35, roughness: 0.05 }) : plainMaterial(o.color ?? '#f4f1ea', { roughness: 0.5 });
  const handle = plainMaterial('#b0b3b8', { metalness: 0.9, roughness: 0.3 });
  const w = o.width;
  const h = o.height;
  const leaves = o.type === 'double' ? 2 : 1;
  const lw = (w - 8) / leaves;
  return (
    <>
      <mesh position={[-w / 2 + 2, h / 2, 0]} material={frame}>
        <boxGeometry args={[4, h, t + 2]} />
      </mesh>
      <mesh position={[w / 2 - 2, h / 2, 0]} material={frame}>
        <boxGeometry args={[4, h, t + 2]} />
      </mesh>
      <mesh position={[0, h - 2, 0]} material={frame}>
        <boxGeometry args={[w, 4, t + 2]} />
      </mesh>
      {Array.from({ length: leaves }, (_, i) => (
        <group key={i}>
          <mesh position={[-w / 2 + 4 + lw * i + lw / 2, (h - 4) / 2, 0]} material={leafMat} castShadow>
            <boxGeometry args={[lw - 1, h - 4, 4]} />
          </mesh>
          <mesh position={[-w / 2 + 4 + lw * i + (i === 0 && leaves === 1 && o.hinge === 'left' ? lw - 8 : 8), 100, 4]} material={handle}>
            <boxGeometry args={[12, 2, 2]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Window3D({ o, t }: { o: Extract<Opening, { kind: 'window' }>; t: number }) {
  const frame = plainMaterial(o.color ?? '#ffffff', { roughness: 0.4 });
  const glass = plainMaterial('#bcdcf0', { transparent: true, opacity: 0.25, roughness: 0.02, metalness: 0.1 });
  const { width: w, height: h, elevation: e } = o;
  const f = 6;
  const panes = Math.max(1, Math.round(w / 90));
  return (
    <>
      <mesh position={[0, e + f / 2, 0]} material={frame}>
        <boxGeometry args={[w, f, 8]} />
      </mesh>
      <mesh position={[0, e + h - f / 2, 0]} material={frame}>
        <boxGeometry args={[w, f, 8]} />
      </mesh>
      {Array.from({ length: panes + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (w / panes) * i + (i === 0 ? f / 2 : i === panes ? -f / 2 : 0), e + h / 2, 0]} material={frame}>
          <boxGeometry args={[f, h, 8]} />
        </mesh>
      ))}
      <mesh position={[0, e + h / 2, 0]} material={glass}>
        <boxGeometry args={[w - f, h - f, 1]} />
      </mesh>
      {e > 0 && (
        <mesh position={[0, e - 1.5, t / 2 + 3]} material={plainMaterial('#f1f1ef')} receiveShadow>
          <boxGeometry args={[w + 8, 3, 10]} />
        </mesh>
      )}
    </>
  );
}

// ------------------------------------------------------------------ floors

function RoomFloor({ room, walls, y, ceiling }: { room: Room; walls: Wall[]; y: number; ceiling: number | null }) {
  const geometry = useMemo(() => {
    const inner = roomInnerPolygon(room.polygon, walls);
    const shape = new THREE.Shape(inner.map((p) => new THREE.Vector2(p.x, p.y)));
    return new THREE.ShapeGeometry(shape);
  }, [room.polygon, walls]);
  const mat = materialFor(room.floorMaterialId ?? DEFAULT_FLOOR_MATERIAL);
  const floorMat = useMemo(() => {
    const m = mat.clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [mat]);
  return (
    <>
      <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, y + 0.5, 0]} material={floorMat} receiveShadow />
      {ceiling !== null && (
        <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, y + ceiling, 0]} material={plainMaterial('#fafaf8', { side: THREE.DoubleSide })} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ objects

function Object3D({ obj, floor, selected, baseY }: { obj: PlacedObject; floor: Floor; selected: boolean; baseY: number }) {
  const item = CATALOG_BY_ID[obj.catalogItemId];
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const dragging = useRef<{ plane: THREE.Plane; grab: THREE.Vector3; moved: boolean } | null>(null);
  const night = useEditor((s) => s.project.settings.timeOfDay === 'night');

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    s.select({ kind: 'object', id: obj.id });
    if (s.walkMode) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(baseY + obj.position.z));
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane, hit)) return;
    dragging.current = { plane, grab: hit.sub(new THREE.Vector3(obj.position.x, 0, obj.position.y)), moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
    s.beginPreview();
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragging.current;
    if (!d) return;
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(d.plane, hit)) return;
    const s = useEditor.getState();
    let x = Math.round(hit.x - d.grab.x);
    let y = Math.round(hit.z - d.grab.z);
    let rotation: number | undefined;
    if (s.snapToWalls || item?.wallMounted) {
      const snap = snapObjectToWall({ ...obj, position: { ...obj.position, x, y } }, floor.walls, 25);
      if (snap) {
        x = snap.position.x;
        y = snap.position.y;
        rotation = snap.rotation;
      }
    }
    d.moved = true;
    s.preview(MoveObjectCommand(floor.id, obj.id, x, y, rotation));
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = dragging.current;
    if (!d) return;
    dragging.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (controls) controls.enabled = true;
    const s = useEditor.getState();
    if (!d.moved) {
      s.endPreview(null);
      return;
    }
    const current = s.project.floors.find((f) => f.id === floor.id)?.objects.find((o) => o.id === obj.id);
    s.endPreview(current ? MoveObjectCommand(floor.id, obj.id, current.position.x, current.position.y, current.rotation) : null);
  };

  return (
    <group
      position={[obj.position.x, baseY + obj.position.z, obj.position.y]}
      rotation={[0, (-obj.rotation * Math.PI) / 180, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <Furniture3D obj={obj} item={item} />
      {item?.light && obj.lightOn !== false && (
        <pointLight position={lightOffset(item, obj)} intensity={night ? 900 : 250} distance={night ? 900 : 500} decay={1.2} color="#ffd9a0" />
      )}
      {selected && (
        <lineSegments position={[0, obj.height / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(obj.width + 2, obj.height + 2, obj.depth + 2)]} />
          <lineBasicMaterial color="#2563eb" />
        </lineSegments>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ cameras

function WalkControls({ start, baseY }: { start: THREE.Vector3; baseY: number }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const keys = useRef(new Set<string>());

  useEffect(() => {
    camera.position.set(start.x, baseY + EYE_HEIGHT, start.z);
    yaw.current = 0;
    pitch.current = 0;
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      yaw.current -= (e.clientX - last.x) * 0.004;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      last = null;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      keys.current.add(e.code);
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [camera, gl, start, baseY]);

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.has('ShiftLeft') ? 350 : 170) * dt;
    let f = walkInput.forward;
    let r = walkInput.right;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
    yaw.current -= walkInput.turn * dt * 1.8;
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    camera.position.addScaledVector(fwd, f * speed).addScaledVector(right, r * speed);
    camera.position.y = baseY + EYE_HEIGHT;
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });
  return null;
}

function Lights({ project, center, radius }: { project: ProjectData; center: THREE.Vector3; radius: number }) {
  const night = project.settings.timeOfDay === 'night';
  const a = (project.settings.sunAngle * Math.PI) / 180;
  const sunPos: [number, number, number] = [center.x + Math.cos(a) * radius * 1.5, radius * 1.6 + 400, center.z + Math.sin(a) * radius * 1.5];
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (!light.current) return;
    light.current.target.position.copy(center);
    light.current.target.updateMatrixWorld();
    const cam = light.current.shadow.camera;
    const r = radius * 1.3 + 200;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 10;
    cam.far = radius * 6 + 3000;
    cam.updateProjectionMatrix();
  }, [center, radius, sunPos]);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b8a98f', night ? 0.08 : 1.1]} />
      <ambientLight intensity={night ? 0.05 : 0.35} />
      {!night && (
        <directionalLight
          ref={light}
          position={sunPos}
          intensity={2.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0004}
          shadow-normalBias={2}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ scene

function SceneContent() {
  const project = useEditor((s) => s.project);
  const planStyle = useEditor((s) => s.planStyle);
  const floorId = useEditor((s) => s.floorId);
  const selection = useEditor((s) => s.selection);
  const walkMode = useEditor((s) => s.walkMode);
  const activeIndex = Math.max(0, project.floors.findIndex((f) => f.id === floorId));
  const visibleFloors = project.floors.slice(0, activeIndex + 1);
  const active = project.floors[activeIndex];
  const baseOf = (i: number) => project.floors.slice(0, i).reduce((s, f) => s + f.height + 20, 0);
  const activeBase = baseOf(activeIndex);

  const { center, radius } = useMemo(() => {
    const pts = active.walls.flatMap((w) => [w.start, w.end]);
    if (!pts.length) return { center: new THREE.Vector3(400, 0, 250), radius: 600 };
    const bb = boundingBox(pts);
    return {
      center: new THREE.Vector3(bb.minX + bb.width / 2, activeBase, bb.minY + bb.height / 2),
      radius: Math.max(bb.width, bb.height) / 2 + 100,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId, active.walls.length, activeBase]);

  const { camera } = useThree();
  useEffect(() => {
    if (walkMode) return;
    camera.position.set(center.x + radius * 0.35, center.y + radius * 2.2 + 300, center.z + radius * 1.1);
    camera.lookAt(center);
  }, [camera, center, radius, walkMode]);

  const walkStart = useMemo(() => {
    const room = active.rooms[0];
    if (!room) return center.clone();
    const bb = boundingBox(room.polygon);
    return new THREE.Vector3(bb.minX + bb.width / 2, 0, bb.minY + bb.height / 2);
  }, [active.rooms, center]);

  const night = project.settings.timeOfDay === 'night';
  // Blueprint style: dark studio backdrop with an engineering grid on the ground
  const blueprint = planStyle === 'blueprint';
  const gridSize = Math.ceil((radius * 8) / 100) * 100;

  return (
    <>
      <color attach="background" args={[night ? '#0b1220' : blueprint ? '#0d1a2c' : '#dfe8f1']} />
      <Lights project={project} center={center} radius={radius} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center.x, -1, center.z]}
        receiveShadow
        onClick={(e) => e.delta < 5 && useEditor.getState().select(null)}
      >
        <planeGeometry args={[radius * 12, radius * 12]} />
        <meshStandardMaterial color={night ? '#1f2937' : blueprint ? '#1b2a40' : '#e7e3da'} roughness={1} />
      </mesh>
      {blueprint && <gridHelper args={[gridSize, gridSize / 100, '#2f6c9e', '#1f3b5c']} position={[center.x, -0.5, center.z]} />}
      {visibleFloors.map((floor, i) => {
        const y = baseOf(i);
        return (
          <group key={floor.id}>
            <group position={[0, y, 0]}>
              {floor.walls.map((w) => (
                <Wall3D key={w.id} wall={w} walls={floor.walls} rooms={floor.rooms} openings={floor.openings.filter((o) => o.wallId === w.id)} />
              ))}
            </group>
            {floor.rooms.map((r) => (
              <RoomFloor key={r.id} room={r} walls={floor.walls} y={y} ceiling={walkMode && i === activeIndex ? floor.height : null} />
            ))}
            {floor.objects.map((o) => (
              <Object3D key={o.id} obj={o} floor={floor} baseY={y} selected={selection?.kind === 'object' && selection.id === o.id} />
            ))}
          </group>
        );
      })}
      {walkMode ? (
        <WalkControls start={walkStart} baseY={activeBase} />
      ) : (
        <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={100} maxDistance={radius * 8} />
      )}
    </>
  );
}

export default function Scene3D() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 55, near: 5, far: 100000, position: [800, 900, 1200] }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ gl, scene }) => {
        viewport.canvas3d = gl.domElement;
        if (import.meta.env.DEV) (window as unknown as { __scene: THREE.Scene }).__scene = scene;
      }}
    >
      <SceneContent />
    </Canvas>
  );
}
