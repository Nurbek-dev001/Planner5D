import type { Floor, Opening, RoomType, Vec2, Wall } from './types';
import { createDoor, createWall, createWindow } from './project';
import { clampOpeningOffset, pointInPolygon, projectOnSegment, wallLength } from './geometry';
import { defaultFloorMaterial } from './rooms';

/**
 * Floor-plan recognition result in IMAGE PIXELS, produced either by the AI vision model
 * (server) or by the local computer-vision detector (browser). `buildPlanGeometry`
 * turns it into clean editor walls / openings in centimetres.
 */
export interface RecognizedPlan {
  source: 'ai' | 'local';
  imageWidth: number;
  imageHeight: number;
  /** Wall centre lines; doors and windows may be drawn as gaps or continuous */
  walls: { x1: number; y1: number; x2: number; y2: number; thickness: number }[];
  /** Centre point and width of each door / window */
  openings: { kind: 'door' | 'window'; x: number; y: number; width: number }[];
  /** Room labels read from the drawing */
  rooms: { name: string; x: number; y: number }[];
  /** Scale if it could be read from dimension annotations */
  cmPerPixel: number | null;
}

export interface PlanGeometry {
  walls: Wall[];
  openings: Opening[];
  roomLabels: { name: string; point: Vec2 }[];
}

interface Seg {
  a: Vec2;
  b: Vec2;
  t: number;
  /** 'h' / 'v' for axis-aligned walls (most plans), null for diagonal ones */
  axis: 'h' | 'v' | null;
}

const AXIS_TOLERANCE = Math.tan((7 * Math.PI) / 180);

function classify(s: Seg): Seg {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  if (Math.abs(dy) <= Math.abs(dx) * AXIS_TOLERANCE) {
    const y = (s.a.y + s.b.y) / 2;
    const [x1, x2] = s.a.x <= s.b.x ? [s.a.x, s.b.x] : [s.b.x, s.a.x];
    return { a: { x: x1, y }, b: { x: x2, y }, t: s.t, axis: 'h' };
  }
  if (Math.abs(dx) <= Math.abs(dy) * AXIS_TOLERANCE) {
    const x = (s.a.x + s.b.x) / 2;
    const [y1, y2] = s.a.y <= s.b.y ? [s.a.y, s.b.y] : [s.b.y, s.a.y];
    return { a: { x, y: y1 }, b: { x, y: y2 }, t: s.t, axis: 'v' };
  }
  return { ...s, axis: null };
}

const len = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/**
 * Joins collinear pieces of the same wall (split by door / window gaps or by the detector)
 * and records each bridged gap as an opening candidate.
 */
function mergeCollinear(segs: Seg[], maxGap: number, gaps: { point: Vec2; width: number; axis: 'h' | 'v' }[]): Seg[] {
  const out: Seg[] = segs.filter((s) => s.axis === null);
  for (const axis of ['h', 'v'] as const) {
    const list = segs.filter((s) => s.axis === axis);
    const key = (s: Seg) => (axis === 'h' ? s.a.y : s.a.x);
    const from = (s: Seg) => (axis === 'h' ? s.a.x : s.a.y);
    const to = (s: Seg) => (axis === 'h' ? s.b.x : s.b.y);
    list.sort((p, q) => key(p) - key(q) || from(p) - from(q));
    const used = new Set<Seg>();
    for (const s of list) {
      if (used.has(s)) continue;
      used.add(s);
      // Pieces on (almost) the same line, in order along it
      const line = list
        .filter((o) => !used.has(o) && Math.abs(key(o) - key(s)) <= Math.max(s.t, o.t) * 0.6)
        .sort((p, q) => from(p) - from(q));
      let cur = { start: from(s), end: to(s), k: key(s), t: s.t, w: len(s) };
      const flush = () => {
        const k = cur.k;
        out.push(
          axis === 'h'
            ? { a: { x: cur.start, y: k }, b: { x: cur.end, y: k }, t: cur.t, axis }
            : { a: { x: k, y: cur.start }, b: { x: k, y: cur.end }, t: cur.t, axis },
        );
      };
      for (const o of line) {
        const gap = from(o) - cur.end;
        if (gap > maxGap) continue;
        used.add(o);
        if (gap > Math.max(cur.t, o.t) * 1.5) {
          const mid = (cur.end + from(o)) / 2;
          gaps.push({ point: axis === 'h' ? { x: mid, y: cur.k } : { x: cur.k, y: mid }, width: gap, axis });
        }
        const w = len(o);
        // Length-weighted line position and thickness
        cur = {
          start: Math.min(cur.start, from(o)),
          end: Math.max(cur.end, to(o)),
          k: (cur.k * cur.w + key(o) * w) / (cur.w + w),
          t: (cur.t * cur.w + o.t * w) / (cur.w + w),
          w: cur.w + w,
        };
      }
      flush();
    }
  }
  return out;
}

/** Snaps wall ends that meet into shared corner points (L / T / X junctions) */
function joinEnds(segs: Seg[]) {
  const ends: { s: Seg; which: 'a' | 'b' }[] = segs.flatMap((s) => [
    { s, which: 'a' as const },
    { s, which: 'b' as const },
  ]);
  const done = new Set<string>();
  const id = (e: { s: Seg; which: 'a' | 'b' }) => `${segs.indexOf(e.s)}${e.which}`;

  // 1. Corners: cluster nearby endpoints, take x from vertical walls and y from horizontal ones
  for (const e of ends) {
    if (done.has(id(e))) continue;
    const p = e.s[e.which];
    const tol = e.s.t * 1.2 + 4;
    const cluster = ends.filter((o) => !done.has(id(o)) && o.s !== e.s && Math.hypot(o.s[o.which].x - p.x, o.s[o.which].y - p.y) <= Math.max(tol, o.s.t * 1.2 + 4));
    if (!cluster.length) continue;
    const all = [e, ...cluster];
    const vs = all.filter((o) => o.s.axis === 'v');
    const hs = all.filter((o) => o.s.axis === 'h');
    const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
    const x = vs.length ? avg(vs.map((o) => o.s.a.x)) : avg(all.map((o) => o.s[o.which].x));
    const y = hs.length ? avg(hs.map((o) => o.s.a.y)) : avg(all.map((o) => o.s[o.which].y));
    for (const o of all) {
      o.s[o.which] = { x, y };
      done.add(id(o));
    }
  }

  // 2. T-junctions: a free end close to another wall's body is extended / trimmed onto it
  for (const e of ends) {
    if (done.has(id(e))) continue;
    const p = e.s[e.which];
    for (const o of segs) {
      if (o === e.s) continue;
      const pr = projectOnSegment(p, o.a, o.b);
      if (pr.t > 0.02 && pr.t < 0.98 && pr.distance <= o.t * 0.5 + e.s.t + 6) {
        const q = e.s.axis === 'h' && o.axis === 'v' ? { x: o.a.x, y: p.y } : e.s.axis === 'v' && o.axis === 'h' ? { x: p.x, y: o.a.y } : pr.point;
        e.s[e.which] = q;
        done.add(id(e));
        break;
      }
    }
  }
}

const round = (v: number) => Math.round(v);
/** Imported coordinates are snapped to a 5 cm grid: clean dimensions, exact corners */
const snap5 = (v: number) => Math.round(v / 5) * 5;

/**
 * Turns a recognised plan into editor geometry: scales pixels to centimetres, straightens
 * near-axis walls, bridges door / window gaps, joins corners and T-junctions, and attaches
 * doors and windows to the nearest wall.
 */
export function buildPlanGeometry(plan: RecognizedPlan, cmPerPixel: number, opts: { wallHeight?: number } = {}): PlanGeometry {
  const k = cmPerPixel;
  let segs: Seg[] = plan.walls
    .map((w) => classify({ a: { x: w.x1 * k, y: w.y1 * k }, b: { x: w.x2 * k, y: w.y2 * k }, t: Math.max(1, w.thickness * k), axis: null }))
    .filter((s) => len(s) >= 10);

  const gaps: { point: Vec2; width: number; axis: 'h' | 'v' }[] = [];
  segs = mergeCollinear(segs, 260, gaps);
  joinEnds(segs);
  segs = segs.filter((s) => len(s) >= 25);

  const walls = segs.map((s) =>
    createWall(
      { x: snap5(s.a.x), y: snap5(s.a.y) },
      { x: snap5(s.b.x), y: snap5(s.b.y) },
      { thickness: Math.min(50, Math.max(8, round(s.t / 2) * 2)), height: opts.wallHeight ?? 270 },
    ),
  );

  // Outer contour: openings on it are windows, inside it doors (used for bridged gaps)
  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const bb = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const onContour = (p: Vec2, t: number) =>
    Math.abs(p.x - bb.minX) <= t || Math.abs(p.x - bb.maxX) <= t || Math.abs(p.y - bb.minY) <= t || Math.abs(p.y - bb.maxY) <= t;

  const candidates: { kind: 'door' | 'window'; point: Vec2; width: number }[] = plan.openings.map((o) => ({
    kind: o.kind,
    point: { x: o.x * k, y: o.y * k },
    width: o.width * k,
  }));
  for (const g of gaps) {
    // Explicitly recognised openings win over inferred gaps
    if (candidates.some((c) => Math.hypot(c.point.x - g.point.x, c.point.y - g.point.y) < g.width / 2 + 20)) continue;
    if (g.width < 55) continue;
    candidates.push({ kind: onContour(g.point, 30) ? 'window' : 'door', point: g.point, width: g.width });
  }

  const openings: Opening[] = [];
  for (const c of candidates) {
    let best: { wall: Wall; offset: number; distance: number } | null = null;
    for (const w of walls) {
      const pr = projectOnSegment(c.point, w.start, w.end);
      if (pr.distance > w.thickness / 2 + 35) continue;
      if (!best || pr.distance < best.distance) best = { wall: w, offset: pr.t * wallLength(w), distance: pr.distance };
    }
    if (!best) continue;
    const l = wallLength(best.wall);
    const width = Math.min(Math.max(c.kind === 'door' ? 70 : 60, round(c.width / 5) * 5), Math.max(40, l - 10), 300);
    if (width < 40) continue;
    const o = c.kind === 'door' ? createDoor(best.wall, best.offset, { width: Math.min(width, 160) }) : createWindow(best.wall, best.offset, { width });
    o.offset = clampOpeningOffset(best.wall, o);
    // Skip overlaps with an opening already on this wall
    const clash = openings.some((p) => p.wallId === o.wallId && Math.abs(p.offset - o.offset) < (p.width + o.width) / 2);
    if (!clash) openings.push(o);
  }

  return {
    walls,
    openings,
    roomLabels: plan.rooms.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), point: { x: r.x * k, y: r.y * k } })),
  };
}

const ROOM_TYPE_WORDS: [RegExp, RoomType][] = [
  [/кух|kitchen/i, 'kitchen'],
  [/спал|bed/i, 'bedroom'],
  [/дет|kid|child/i, 'kids'],
  [/кабин|office|study/i, 'office'],
  [/с\/?у|санузел|туалет|wc|toilet/i, 'toilet'],
  [/ванн|bath|душ/i, 'bathroom'],
  [/корид|прихож|холл|hall|entr/i, 'hallway'],
  [/балк|лодж|terrace|balcon/i, 'balcony'],
  [/гардер|кладов|wardrobe|storage|closet/i, 'wardrobe'],
  [/гост|зал|living|комн|room/i, 'living'],
];

export function roomTypeFromName(name: string): RoomType {
  return ROOM_TYPE_WORDS.find(([re]) => re.test(name))?.[1] ?? 'custom';
}

/** Names detected rooms after the room graph is rebuilt (labels from the drawing) */
export function applyRoomLabels(floor: Pick<Floor, 'rooms'>, labels: PlanGeometry['roomLabels']) {
  for (const label of labels) {
    const room = floor.rooms.find((r) => pointInPolygon(label.point, r.polygon));
    if (!room) continue;
    room.name = label.name.charAt(0).toUpperCase() + label.name.slice(1);
    const type = roomTypeFromName(label.name);
    if (type !== 'custom') {
      room.type = type;
      room.floorMaterialId = defaultFloorMaterial(type);
    }
  }
}

/**
 * Rough default scale when the drawing has no readable dimensions: the thinnest walls are
 * interior partitions, drawn about 12 cm thick on typical apartment plans.
 */
export function guessCmPerPixel(plan: RecognizedPlan): number {
  const t = plan.walls.map((w) => w.thickness).sort((a, b) => a - b);
  const partition = t.length ? t[Math.floor(t.length * 0.25)] : 0;
  return partition > 0 ? 12 / partition : 1;
}
