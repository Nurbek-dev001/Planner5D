import type { Vec2, Wall, Opening, PlacedObject } from './types';

export const EPS = 1e-6;

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Left-hand normal in screen coordinates (rotate +90°) */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const samePoint = (a: Vec2, b: Vec2, tol = 0.5): boolean => dist(a, b) <= tol;

export function wallLength(w: Pick<Wall, 'start' | 'end'>): number {
  return dist(w.start, w.end);
}

export function wallDirection(w: Pick<Wall, 'start' | 'end'>): Vec2 {
  return normalize(sub(w.end, w.start));
}

export function wallAngleDeg(w: Pick<Wall, 'start' | 'end'>): number {
  return (Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) / Math.PI;
}

/** Point on wall centre line at `offset` cm from the start */
export function pointOnWall(w: Pick<Wall, 'start' | 'end'>, offset: number): Vec2 {
  return add(w.start, scale(wallDirection(w), offset));
}

/** Projection of p onto segment ab: parameter t in [0,1], closest point, distance */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = add(a, scale(ab, t));
  return { t, point, distance: dist(p, point) };
}

/** Intersection of segments ab and cd (proper or touching). Returns parameters on both. */
export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null; // parallel / collinear
  const qp = sub(c, a);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t, u, point: add(a, scale(r, t)) };
}

/** Intersection of infinite lines p1 + t*d1 and p2 + u*d2 */
export function lineIntersection(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denom = cross(d1, d2);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(p2, p1), d2) / denom;
  return add(p1, scale(d1, t));
}

/** Signed polygon area (positive for counter-clockwise in a Y-up system) */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / Math.max(1, poly.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** A point guaranteed to be inside the polygon (centroid, or a nearby interior point for concave shapes) */
export function interiorPoint(poly: Vec2[]): Vec2 {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;
  // Scan horizontal line through centroid and take midpoint of the first inside span
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y > c.y !== b.y > c.y) xs.push(a.x + ((c.y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((m, n) => m - n);
  if (xs.length >= 2) return { x: (xs[0] + xs[1]) / 2, y: c.y };
  return c;
}

export function boundingBox(points: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Offset a simple polygon inwards by a per-edge distance (e.g. half the wall thickness),
 * producing the inner "clean" floor outline of a room.
 */
export function insetPolygon(poly: Vec2[], distances: number[]): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly;
  const ccw = signedArea(poly) > 0;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const d = normalize(sub(q, p));
    // Inward normal: for CCW (y-up math orientation) interior is on the left
    const nrm = ccw ? perp(d) : scale(perp(d), -1);
    return { p: add(p, scale(nrm, distances[i] ?? 0)), d };
  });
  return poly.map((p, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    return lineIntersection(prev.p, prev.d, cur.p, cur.d) ?? cur.p;
  });
}

/** Clamp an opening so it fits inside its wall */
export function clampOpeningOffset(wall: Wall, opening: Pick<Opening, 'width' | 'offset'>): number {
  const l = wallLength(wall);
  const half = opening.width / 2;
  if (l <= opening.width) return l / 2;
  return Math.max(half, Math.min(l - half, opening.offset));
}

/** Rotated rectangle corners of an object footprint on the plan */
export function objectFootprint(obj: Pick<PlacedObject, 'position' | 'rotation' | 'width' | 'depth'>): Vec2[] {
  const r = (obj.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = obj.width / 2;
  const hd = obj.depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({ x: obj.position.x + p.x * c - p.y * s, y: obj.position.y + p.x * s + p.y * c }));
}

export function snapToGrid(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Snap the direction from `from` to `to` to multiples of `stepDeg`, keeping the length */
export function snapAngle(from: Vec2, to: Vec2, stepDeg = 15): Vec2 {
  const d = sub(to, from);
  const l = len(d);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(d.y, d.x) / step) * step;
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l };
}

export interface WallSnapResult {
  position: { x: number; y: number };
  rotation: number;
  wallId: string;
}

/**
 * "Snap to wall": if an object is close to a wall, rotate it to face away from the wall
 * and push its back flush against the wall's inner face.
 */
export function snapObjectToWall(
  obj: Pick<PlacedObject, 'position' | 'width' | 'depth' | 'rotation'>,
  walls: Wall[],
  threshold = 30,
): WallSnapResult | null {
  let best: { wall: Wall; distance: number; point: Vec2 } | null = null;
  const p = { x: obj.position.x, y: obj.position.y };
  for (const w of walls) {
    const pr = projectOnSegment(p, w.start, w.end);
    if (pr.t <= 0 || pr.t >= 1) continue;
    const gap = pr.distance - w.thickness / 2 - obj.depth / 2;
    if (gap > threshold) continue;
    if (!best || pr.distance < best.distance) best = { wall: w, distance: pr.distance, point: pr.point };
  }
  if (!best) return null;
  const { wall, point } = best;
  const dir = wallDirection(wall);
  let nrm = perp(dir);
  // Normal pointing to the side of the wall where the object is
  if (dot(sub(p, point), nrm) < 0) nrm = scale(nrm, -1);
  const offset = wall.thickness / 2 + obj.depth / 2;
  const pos = add(point, scale(nrm, offset));
  // Object "front" is local +y (depth axis); back faces the wall → front along normal
  const rotation = (Math.atan2(nrm.y, nrm.x) * 180) / Math.PI - 90;
  return { position: { x: pos.x, y: pos.y }, rotation: normalizeAngle(rotation), wallId: wall.id };
}

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return Math.round(a * 100) / 100;
}
