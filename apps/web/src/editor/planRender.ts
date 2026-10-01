import {
  add,
  formatLength,
  perp,
  pointInPolygon,
  pointOnWall,
  samePoint,
  scale as vscale,
  sub,
  wallDirection,
  wallLength,
  type Floor,
  type Opening,
  type Units,
  type Vec2,
  type Wall,
} from '@spaceplan/shared';
import { MONO_FONT, type PlanTheme } from './planTheme';

/**
 * Canvas drawing routines for the technical-drawing look of the 2D plan.
 * Everything is drawn in world units (cm); `px` is the size of one screen pixel in world units.
 */

/** Outline polygon of a wall, extended by half thickness at joined ends to close corners */
export function wallPolygon(w: Wall, walls: Wall[]): Vec2[] {
  const dir = wallDirection(w);
  const n = vscale(perp(dir), w.thickness / 2);
  const joined = (p: Vec2) => walls.some((o) => o.id !== w.id && (samePoint(o.start, p) || samePoint(o.end, p)));
  const s = joined(w.start) ? sub(w.start, vscale(dir, w.thickness / 2)) : w.start;
  const e = joined(w.end) ? add(w.end, vscale(dir, w.thickness / 2)) : w.end;
  return [add(s, n), add(e, n), sub(e, n), sub(s, n)];
}

function tracePolygon(c: CanvasRenderingContext2D, poly: Vec2[]) {
  poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
}

/** Visible world rectangle of the stage */
export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Solid background + two-level engineering grid + origin axes */
export function drawGrid(c: CanvasRenderingContext2D, r: WorldRect, px: number, t: PlanTheme) {
  c.fillStyle = t.bg;
  c.fillRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
  const steps = [10, 50, 100, 500, 1000, 5000];
  const minor = steps.find((st) => st / px >= 9) ?? 5000;
  const major = ({ 10: 100, 50: 500, 100: 1000, 500: 5000, 1000: 5000 } as Record<number, number>)[minor] ?? 10000;
  const lines = (step: number, color: string, width: number) => {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = width * px;
    for (let x = Math.floor(r.minX / step) * step; x <= r.maxX; x += step) {
      c.moveTo(x, r.minY);
      c.lineTo(x, r.maxY);
    }
    for (let y = Math.floor(r.minY / step) * step; y <= r.maxY; y += step) {
      c.moveTo(r.minX, y);
      c.lineTo(r.maxX, y);
    }
    c.stroke();
  };
  lines(minor, t.gridMinor, 1);
  lines(major, t.gridMajor, 1);
  c.beginPath();
  c.strokeStyle = t.gridAxis;
  c.lineWidth = px;
  c.setLineDash([8 * px, 4 * px, 2 * px, 4 * px]);
  c.moveTo(0, r.minY);
  c.lineTo(0, r.maxY);
  c.moveTo(r.minX, 0);
  c.lineTo(r.maxX, 0);
  c.stroke();
  c.setLineDash([]);
}

/**
 * All walls as one sectioned solid: outline → fill → diagonal hatch.
 * Filling over the doubled outline erases the seams where walls overlap at joints.
 */
export function drawWalls(c: CanvasRenderingContext2D, walls: Wall[], px: number, t: PlanTheme) {
  if (!walls.length) return;
  const polys = walls.map((w) => wallPolygon(w, walls));
  c.beginPath();
  for (const p of polys) tracePolygon(c, p);
  c.lineJoin = 'miter';
  c.lineWidth = 3 * px;
  c.strokeStyle = t.wallStroke;
  c.stroke();
  c.fillStyle = t.wallFill;
  c.fill();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys.flat()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const gap = Math.max(6 * px, 2.5);
  if ((maxX - minX + maxY - minY) / gap > 6000) return; // too dense to be useful
  c.save();
  c.clip();
  c.beginPath();
  c.strokeStyle = t.wallHatch;
  c.lineWidth = 0.8 * px;
  for (let k = Math.floor((minX + minY) / gap) * gap; k <= maxX + maxY; k += gap) {
    c.moveTo(k - minY, minY);
    c.lineTo(k - maxY, maxY);
  }
  c.stroke();
  c.restore();
}

export function drawSelectedWall(c: CanvasRenderingContext2D, w: Wall, walls: Wall[], px: number, t: PlanTheme) {
  c.beginPath();
  tracePolygon(c, wallPolygon(w, walls));
  c.fillStyle = t.selFill;
  c.fill();
  c.lineWidth = 1.5 * px;
  c.strokeStyle = t.accent;
  c.stroke();
}

/** Door / window symbol in wall-local coordinates (x along the wall, y across it) */
export function drawOpening(c: CanvasRenderingContext2D, o: Opening, wallThickness: number, selected: boolean, px: number, t: PlanTheme) {
  const w = o.width;
  const h = wallThickness / 2;
  const line = selected ? t.accent : t.wallStroke;
  const thin = selected ? t.accent : t.dim;
  c.save();
  c.lineCap = 'butt';
  // Cut the opening out of the wall section
  c.fillStyle = t.bg;
  c.fillRect(-w / 2, -h - 1.6 * px, w, wallThickness + 3.2 * px);
  if (selected) {
    c.fillStyle = t.selFill;
    c.fillRect(-w / 2, -h, w, wallThickness);
  }
  // Jambs
  c.strokeStyle = line;
  c.lineWidth = 2 * px;
  c.beginPath();
  c.moveTo(-w / 2, -h);
  c.lineTo(-w / 2, h);
  c.moveTo(w / 2, -h);
  c.lineTo(w / 2, h);
  c.stroke();

  if (o.kind === 'window') {
    // Frame faces, double glazing and the sill
    c.lineWidth = px;
    c.beginPath();
    c.moveTo(-w / 2, -h);
    c.lineTo(w / 2, -h);
    c.moveTo(-w / 2, h);
    c.lineTo(w / 2, h);
    c.stroke();
    const g = Math.max(h * 0.22, 1.2);
    c.fillStyle = t.glass;
    c.globalAlpha = 0.35;
    c.fillRect(-w / 2, -g, w, 2 * g);
    c.globalAlpha = 1;
    c.strokeStyle = selected ? t.accent : t.window;
    c.beginPath();
    c.moveTo(-w / 2, -g);
    c.lineTo(w / 2, -g);
    c.moveTo(-w / 2, g);
    c.lineTo(w / 2, g);
    c.stroke();
    c.strokeStyle = thin;
    c.beginPath();
    c.moveTo(-w / 2 - 4, -h - 4);
    c.lineTo(w / 2 + 4, -h - 4);
    c.stroke();
  } else {
    const side = o.swing === 'in' ? 1 : -1;
    if (o.type === 'sliding') {
      const pw = w * 0.55;
      const d = Math.max(h * 0.35, 1.5);
      c.lineWidth = 1.5 * px;
      c.strokeStyle = selected ? t.accent : t.door;
      c.strokeRect(-w / 2, -d, pw, d);
      c.strokeRect(w / 2 - pw, 0, pw, d);
    } else {
      const leaves: [number, number, number][] =
        o.type === 'double'
          ? [
              [-w / 2, w / 2, 1],
              [w / 2, w / 2, -1],
            ]
          : [[o.hinge === 'left' ? -w / 2 : w / 2, w, o.hinge === 'left' ? 1 : -1]];
      for (const [hx, lw, dir] of leaves) {
        const y0 = side * h;
        // Swing arc
        c.beginPath();
        c.strokeStyle = thin;
        c.lineWidth = px;
        c.setLineDash([4 * px, 3 * px]);
        const start = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const end = dir > 0 ? 0 : Math.PI;
        c.arc(hx, y0, lw, start, end, side > 0 === dir > 0);
        c.stroke();
        c.setLineDash([]);
        // Leaf (open at 90°)
        c.beginPath();
        c.strokeStyle = selected ? t.accent : t.door;
        c.lineWidth = 2.5 * px;
        c.moveTo(hx, y0);
        c.lineTo(hx, y0 + side * lw);
        c.stroke();
      }
    }
  }
  c.restore();
}

/** Architectural dimension line: extension lines, 45° ticks, text above the line */
function dimension(c: CanvasRenderingContext2D, a: Vec2, b: Vec2, normal: Vec2, from: number, at: number, label: string, px: number, t: PlanTheme) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len / px < 36) return;
  const pa = add(a, vscale(normal, at));
  const pb = add(b, vscale(normal, at));
  c.strokeStyle = t.dim;
  c.lineWidth = px;
  c.beginPath();
  // Extension lines from the wall face, slightly past the dimension line
  for (const p of [a, b]) {
    const s = add(p, vscale(normal, from + 3 * px));
    const e = add(p, vscale(normal, at + 4 * px));
    c.moveTo(s.x, s.y);
    c.lineTo(e.x, e.y);
  }
  c.moveTo(pa.x, pa.y);
  c.lineTo(pb.x, pb.y);
  c.stroke();
  // Ticks
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const tick = add(vscale(dir, 4 * px), vscale(normal, 4 * px));
  c.lineWidth = 1.6 * px;
  c.beginPath();
  for (const p of [pa, pb]) {
    c.moveTo(p.x - tick.x, p.y - tick.y);
    c.lineTo(p.x + tick.x, p.y + tick.y);
  }
  c.stroke();
  // Label, rotated to stay readable, placed on the outer side of the line
  let ang = Math.atan2(dir.y, dir.x);
  if (ang > Math.PI / 2 + 1e-6) ang -= Math.PI;
  if (ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
  const mid = add(vscale(add(pa, pb), 0.5), vscale(normal, 7 * px));
  c.save();
  c.translate(mid.x, mid.y);
  c.rotate(ang);
  c.scale(px, px);
  c.font = `500 10.5px ${MONO_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const tw = c.measureText(label).width;
  if (tw * px < len - 8 * px) {
    c.fillStyle = t.bg;
    c.fillRect(-tw / 2 - 3, -7, tw + 6, 14);
    c.fillStyle = t.dimText;
    c.fillText(label, 0, 0.5);
  }
  c.restore();
}

/**
 * Per-wall dimensions on the outer side of each wall, plus overall dimensions of the floor.
 * Interior partitions (rooms on both sides) are dimensioned only while selected, to keep rooms readable.
 */
export function drawDimensions(c: CanvasRenderingContext2D, floor: Floor, units: Units, px: number, t: PlanTheme, selectedId?: string) {
  const roomPolys = floor.rooms.map((r) => r.polygon);
  const inside = (p: Vec2) => roomPolys.filter((poly) => pointInPolygon(p, poly)).length;
  for (const w of floor.walls) {
    const n = perp(wallDirection(w));
    const mid = pointOnWall(w, wallLength(w) / 2);
    const probe = w.thickness / 2 + 20;
    const a = inside(add(mid, vscale(n, probe)));
    const b = inside(sub(mid, vscale(n, probe)));
    if (a > 0 && b > 0 && w.id !== selectedId) continue;
    const normal = a < b ? n : vscale(n, -1);
    dimension(c, w.start, w.end, normal, w.thickness / 2, w.thickness / 2 + 18 * px, formatLength(wallLength(w), units), px, t);
  }

  if (floor.walls.length < 3) return;
  const pts = floor.walls.flatMap((w) => wallPolygon(w, floor.walls));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const off = 46 * px;
  dimension(c, { x: minX, y: minY }, { x: maxX, y: minY }, { x: 0, y: -1 }, 0, off, formatLength(maxX - minX, units), px, t);
  dimension(c, { x: minX, y: maxY }, { x: minX, y: minY }, { x: -1, y: 0 }, 0, off, formatLength(maxY - minY, units), px, t);
}

/** Snap marker: square = wall end, diamond = on a wall, cross = grid / angle */
export function drawSnapMarker(c: CanvasRenderingContext2D, p: Vec2, kind: string, px: number, t: PlanTheme) {
  c.save();
  c.translate(p.x, p.y);
  c.lineWidth = 1.5 * px;
  const r = 6 * px;
  if (kind === 'endpoint') {
    c.strokeStyle = t.snapEndpoint;
    c.strokeRect(-r, -r, 2 * r, 2 * r);
  } else if (kind === 'wall') {
    c.strokeStyle = t.snapWall;
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r, 0);
    c.lineTo(0, r);
    c.lineTo(-r, 0);
    c.closePath();
    c.stroke();
  } else {
    c.strokeStyle = t.accent;
    c.beginPath();
    c.moveTo(-r, 0);
    c.lineTo(r, 0);
    c.moveTo(0, -r);
    c.lineTo(0, r);
    c.stroke();
  }
  c.restore();
}

/** Full-screen CAD crosshair through the cursor */
export function drawCrosshair(c: CanvasRenderingContext2D, p: Vec2, r: WorldRect, px: number, t: PlanTheme) {
  c.save();
  c.strokeStyle = t.accent;
  c.globalAlpha = 0.35;
  c.lineWidth = px;
  c.setLineDash([3 * px, 4 * px]);
  c.beginPath();
  c.moveTo(r.minX, p.y);
  c.lineTo(r.maxX, p.y);
  c.moveTo(p.x, r.minY);
  c.lineTo(p.x, r.maxY);
  c.stroke();
  c.restore();
}
