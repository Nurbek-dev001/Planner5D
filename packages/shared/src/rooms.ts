import type { Floor, Room, Vec2, Wall } from './types';
import {
  EPS,
  dist,
  insetPolygon,
  interiorPoint,
  pointInPolygon,
  polygonArea,
  projectOnSegment,
  segmentIntersection,
  signedArea,
  boundingBox,
} from './geometry';
import { uid } from './ids';

const SNAP = 1; // cm — vertices closer than this are considered the same node
const MIN_ROOM_AREA = 5000; // cm² (0.5 m²) — ignore slivers

interface Graph {
  nodes: Vec2[];
  /** adjacency: node -> set of neighbour nodes */
  adj: Map<number, Set<number>>;
  /** wall thickness of each undirected edge "a-b" */
  edgeThickness: Map<string, number>;
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Build a planar graph from wall centre lines: walls are split at every
 * intersection / T-junction so that closed spaces become graph faces.
 */
export function buildWallGraph(walls: Wall[]): Graph {
  const nodes: Vec2[] = [];
  const findOrAdd = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= SNAP) return i;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  // Split parameters for each wall
  const splits: number[][] = walls.map(() => [0, 1]);
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j];
      const x = segmentIntersection(a.start, a.end, b.start, b.end);
      if (x) {
        splits[i].push(x.t);
        splits[j].push(x.u);
        continue;
      }
      // Collinear touching / endpoints lying on the other wall (T-junction within tolerance)
      for (const p of [b.start, b.end]) {
        const pr = projectOnSegment(p, a.start, a.end);
        if (pr.distance <= SNAP) splits[i].push(pr.t);
      }
      for (const p of [a.start, a.end]) {
        const pr = projectOnSegment(p, b.start, b.end);
        if (pr.distance <= SNAP) splits[j].push(pr.t);
      }
    }
  }

  const adj = new Map<number, Set<number>>();
  const edgeThickness = new Map<string, number>();
  const link = (a: number, b: number, t: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
    edgeThickness.set(edgeKey(a, b), t);
  };

  walls.forEach((w, i) => {
    const ts = [...new Set(splits[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((m, n) => m - n);
    let prev: number | null = null;
    for (const t of ts) {
      const p = { x: w.start.x + (w.end.x - w.start.x) * t, y: w.start.y + (w.end.y - w.start.y) * t };
      const n = findOrAdd(p);
      if (prev !== null) link(prev, n, w.thickness);
      prev = n;
    }
  });

  return { nodes, adj, edgeThickness };
}

/**
 * Find all minimal closed faces of the wall graph (candidate rooms).
 * Uses the classic "next edge = smallest clockwise turn" face traversal.
 */
export function findFaces(graph: Graph): { polygon: Vec2[]; thickness: number[] }[] {
  const { nodes, adj, edgeThickness } = graph;

  // Remove dangling edges (degree-1 nodes) iteratively — they can't bound a room
  const deg = new Map<number, Set<number>>();
  adj.forEach((s, k) => deg.set(k, new Set(s)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [k, s] of deg) {
      if (s.size <= 1) {
        for (const n of s) deg.get(n)?.delete(k);
        deg.delete(k);
        changed = true;
      }
    }
  }

  const angle = (from: number, to: number) => Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x);
  const visited = new Set<string>();
  const faces: { polygon: Vec2[]; thickness: number[] }[] = [];

  for (const [start, neighbours] of deg) {
    for (const next of neighbours) {
      const key = `${start}>${next}`;
      if (visited.has(key)) continue;
      const cycle: number[] = [start];
      let u = start;
      let v = next;
      let guard = 0;
      while (guard++ < 10000) {
        visited.add(`${u}>${v}`);
        cycle.push(v);
        // At v, arriving from u: choose the neighbour making the smallest turn to one side
        const back = angle(v, u);
        let best = -1;
        let bestTurn = Infinity;
        for (const w of deg.get(v) ?? []) {
          if (w === u && (deg.get(v)?.size ?? 0) > 1) continue;
          let turn = angle(v, w) - back;
          while (turn <= EPS) turn += 2 * Math.PI;
          if (turn < bestTurn) {
            bestTurn = turn;
            best = w;
          }
        }
        if (best < 0) break;
        u = v;
        v = best;
        if (u === start && v === next) break;
      }
      cycle.pop(); // last node == start
      if (cycle.length < 3) continue;
      const polygon = cycle.map((i) => nodes[i]);
      const thickness = cycle.map((i, idx) => edgeThickness.get(edgeKey(i, cycle[(idx + 1) % cycle.length])) ?? 0);
      faces.push({ polygon, thickness });
    }
  }

  // Faces traversed this way have one orientation; the unbounded outer face has the opposite sign.
  // Keep faces whose orientation matches the majority of bounded faces: bounded faces have
  // negative signed area here (screen coordinates, smallest CCW turn).
  return faces.filter((f) => signedArea(f.polygon) < -EPS && polygonArea(f.polygon) >= MIN_ROOM_AREA);
}

/** Inner (clean floor) polygon of a room, accounting for wall thickness */
export function roomInnerPolygon(polygon: Vec2[], walls: Wall[]): Vec2[] {
  const n = polygon.length;
  const distances = polygon.map((p, i) => {
    const q = polygon[(i + 1) % n];
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    let best = 0;
    let bestD = Infinity;
    for (const w of walls) {
      const pr = projectOnSegment(mid, w.start, w.end);
      if (pr.distance < bestD) {
        bestD = pr.distance;
        best = w.thickness;
      }
    }
    return best / 2;
  });
  return insetPolygon(polygon, distances);
}

export function roomArea(room: Pick<Room, 'polygon'>, walls: Wall[]): number {
  return polygonArea(roomInnerPolygon(room.polygon, walls));
}

/** Width × length of the room's inner bounding box (for labels like "4.20 m × 3.60 m") */
export function roomDimensions(room: Pick<Room, 'polygon'>, walls: Wall[]) {
  const bb = boundingBox(roomInnerPolygon(room.polygon, walls));
  return { width: bb.width, length: bb.height };
}

export const ROOM_TYPE_LABELS: Record<Room['type'], string> = {
  living: 'Гостиная',
  bedroom: 'Спальня',
  kitchen: 'Кухня',
  bathroom: 'Ванная',
  toilet: 'Туалет',
  kids: 'Детская',
  office: 'Кабинет',
  wardrobe: 'Гардеробная',
  hallway: 'Коридор',
  balcony: 'Балкон',
  custom: 'Помещение',
};

const DEFAULT_FLOOR_BY_TYPE: Partial<Record<Room['type'], string>> = {
  bathroom: 'floor-tile-white',
  toilet: 'floor-tile-white',
  kitchen: 'floor-tile-grey',
  balcony: 'floor-tile-grey',
  hallway: 'floor-laminate-oak',
};

export function defaultFloorMaterial(type: Room['type']): string {
  return DEFAULT_FLOOR_BY_TYPE[type] ?? 'floor-parquet-oak';
}

/**
 * Recompute rooms of a floor from its walls ("closed space = room", docs section 8),
 * preserving user metadata (name, type, materials) of rooms that still exist.
 */
export function detectRooms(walls: Wall[], previous: Room[] = []): Room[] {
  const faces = findFaces(buildWallGraph(walls));
  const used = new Set<string>();
  const result: Room[] = [];
  const prevPoints = previous.map((r) => ({ room: r, point: interiorPoint(r.polygon), area: polygonArea(r.polygon) }));

  // Largest faces first so that metadata goes to the best match
  const sorted = [...faces].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon));
  for (const face of sorted) {
    const inner = interiorPoint(face.polygon);
    const area = polygonArea(face.polygon);
    const candidates = prevPoints
      .filter((p) => !used.has(p.room.id))
      .filter((p) => pointInPolygon(p.point, face.polygon) || pointInPolygon(inner, p.room.polygon))
      .sort((a, b) => Math.abs(a.area - area) - Math.abs(b.area - area));
    const match = candidates[0]?.room;
    if (match) {
      used.add(match.id);
      result.push({ ...match, polygon: face.polygon });
    } else {
      result.push({
        id: uid('room'),
        name: ROOM_TYPE_LABELS.custom,
        type: 'custom',
        polygon: face.polygon,
        floorMaterialId: defaultFloorMaterial('custom'),
      });
    }
  }
  return result;
}

/** Apply room detection to a floor (mutating-friendly helper for immer drafts) */
export function syncRooms<T extends Pick<Floor, 'walls' | 'rooms'>>(floor: T): T {
  floor.rooms = detectRooms(floor.walls, floor.rooms);
  return floor;
}

export function floorArea(floor: Pick<Floor, 'walls' | 'rooms'>): number {
  return floor.rooms.reduce((s, r) => s + roomArea(r, floor.walls), 0);
}
