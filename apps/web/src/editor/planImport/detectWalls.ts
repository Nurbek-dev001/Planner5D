import type { RecognizedPlan } from '@spaceplan/shared';

/**
 * Local (in-browser, no server) floor-plan detector for clean scans and exported plans:
 * walls are the long, thick, dark strokes. Thin lines (furniture, dimensions, text,
 * hatching gaps) are rejected by stroke thickness; door / window gaps are bridged later by
 * `buildPlanGeometry`. Photos at an angle are better handled by the AI recogniser.
 */

interface Band {
  /** Position across the band (rows for horizontal walls) */
  from: number;
  to: number;
  /** Extent along the wall */
  start: number;
  end: number;
  lastAcross: number;
}

/** Otsu threshold of a grey-level histogram */
function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** 3×3 closing (dilate then erode) to fill hatching / scan noise inside wall strokes */
function close(mask: Uint8Array, w: number, h: number): Uint8Array {
  const pass = (src: Uint8Array, dilate: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = dilate ? 0 : 1;
        for (let dy = -1; dy <= 1 && v === (dilate ? 0 : 1); dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
            if (dilate ? s : !s) {
              v = dilate ? 1 : 0;
              break;
            }
          }
        out[y * w + x] = v;
      }
    return out;
  };
  return pass(pass(mask, true), false);
}

/**
 * Binary erosion / dilation with a (2r+1)² box, separable via running sums. An opening
 * (erode → dilate) removes every stroke thinner than the box: window glazing lines, door
 * arcs, furniture outlines, text, dimension lines — and keeps the thick wall strokes.
 */
function boxFilter(mask: Uint8Array, w: number, h: number, r: number, erode: boolean): Uint8Array {
  const need = erode ? 2 * r + 1 : 1;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x < w + r; x++) {
      const add = x + r < w && x + r >= 0 ? mask[y * w + x + r] : 0;
      const sub = x - r - 1 >= 0 && x - r - 1 < w ? mask[y * w + x - r - 1] : 0;
      sum += add - sub;
      if (x >= 0 && x < w) tmp[y * w + x] = sum >= need ? 1 : 0;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y < h + r; y++) {
      const add = y + r < h && y + r >= 0 ? tmp[(y + r) * w + x] : 0;
      const sub = y - r - 1 >= 0 && y - r - 1 < h ? tmp[(y - r - 1) * w + x] : 0;
      sum += add - sub;
      if (y >= 0 && y < h) out[y * w + x] = sum >= need ? 1 : 0;
    }
  }
  return out;
}

const open = (mask: Uint8Array, w: number, h: number, r: number) => boxFilter(boxFilter(mask, w, h, r, true), w, h, r, false);

/**
 * Finds wall bands along one axis. `at(along, across)` reads the mask; for horizontal walls
 * `along` = x and `across` = y.
 */
function bands(at: (along: number, across: number) => number, alongSize: number, acrossSize: number, minRun: number): Band[] {
  const done: Band[] = [];
  let active: Band[] = [];
  for (let c = 0; c < acrossSize; c++) {
    const runs: [number, number][] = [];
    let s = -1;
    for (let a = 0; a <= alongSize; a++) {
      const on = a < alongSize && at(a, c) === 1;
      if (on && s < 0) s = a;
      if (!on && s >= 0) {
        if (a - s >= minRun) runs.push([s, a - 1]);
        s = -1;
      }
    }
    const next: Band[] = [];
    for (const [r0, r1] of runs) {
      // Continue the band that overlaps this run the most
      let match: Band | undefined;
      let bestOverlap = 0;
      for (const b of active) {
        const overlap = Math.min(b.end, r1) - Math.max(b.start, r0);
        if (overlap > bestOverlap && overlap >= 0.6 * Math.min(r1 - r0, b.end - b.start)) {
          bestOverlap = overlap;
          match = b;
        }
      }
      if (match && !next.includes(match)) {
        match.to = c;
        match.lastAcross = c;
        // A wall band keeps a stable extent; average it with the new run
        match.start = Math.round((match.start * 3 + r0) / 4);
        match.end = Math.round((match.end * 3 + r1) / 4);
        next.push(match);
      } else {
        next.push({ from: c, to: c, start: r0, end: r1, lastAcross: c });
      }
    }
    for (const b of active) if (!next.includes(b)) done.push(b);
    active = next;
  }
  return done.concat(active);
}

/** Typical wall stroke thickness: length-weighted 60th percentile of long dark bands */
function estimateWallThickness(mask: Uint8Array, w: number, h: number, minRun: number, size: number): number {
  const hb = bands((x, y) => mask[y * w + x], w, h, minRun);
  const vb = bands((y, x) => mask[y * w + x], h, w, minRun);
  const plausible = [...hb, ...vb]
    .map((b) => ({ thick: b.to - b.from + 1, len: b.end - b.start + 1 }))
    .filter((x) => x.thick >= 3 && x.thick <= size * 0.05 && x.len >= minRun)
    .sort((p, q) => p.thick - q.thick);
  const totalLen = plausible.reduce((s, x) => s + x.len, 0);
  let acc = 0;
  for (const x of plausible) {
    acc += x.len;
    if (acc >= totalLen * 0.6) return x.thick;
  }
  return 4;
}

export function detectWalls(image: ImageData): RecognizedPlan {
  const { width: w, height: h, data } = image;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    // Transparent pixels count as white paper
    gray[i] = Math.round((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 255 * (1 - a));
  }
  const t = Math.min(otsu(gray), 170);
  let mask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = gray[i] < t ? 1 : 0;
  mask = close(mask, w, h);

  const size = Math.max(w, h);
  const minRun = Math.max(18, Math.round(size * 0.03));
  const wallT = estimateWallThickness(mask, w, h, minRun, size);
  // Erase everything thinner than about half a wall before looking for walls
  const r = Math.max(1, Math.floor(wallT * 0.3));
  mask = open(mask, w, h, r);
  const hb = bands((x, y) => mask[y * w + x], w, h, minRun);
  const vb = bands((y, x) => mask[y * w + x], h, w, minRun);
  const all = [...hb, ...vb].map((b) => ({ b, thick: b.to - b.from + 1, len: b.end - b.start + 1 }));
  const minThick = Math.max(2, Math.round(wallT * 0.45));

  // Integral image → ink density of a band's rectangle. Walls are solid (after closing);
  // bold text or patterns that merged into a band are not.
  const integral = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const ink = (x0: number, y0: number, x1: number, y1: number) =>
    integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
  const density = (b: Band, horizontal: boolean) => {
    const [x0, y0, x1, y1] = horizontal ? [b.start, b.from, b.end, b.to] : [b.from, b.start, b.to, b.end];
    return ink(x0, y0, x1, y1) / ((x1 - x0 + 1) * (y1 - y0 + 1));
  };

  const isWall = (x: { b: Band; thick: number; len: number }) =>
    x.thick >= minThick && x.thick <= size * 0.06 && x.len >= Math.max(minRun, x.thick * 2.5) && density(x.b, hb.includes(x.b)) >= 0.75;

  const walls: RecognizedPlan['walls'] = [];
  for (const x of all) {
    if (!isWall(x)) continue;
    const mid = (x.b.from + x.b.to) / 2;
    if (hb.includes(x.b)) walls.push({ x1: x.b.start, y1: mid, x2: x.b.end, y2: mid, thickness: x.thick });
    else walls.push({ x1: mid, y1: x.b.start, x2: mid, y2: x.b.end, thickness: x.thick });
  }

  return { source: 'local', imageWidth: w, imageHeight: h, walls, openings: [], rooms: [], cmPerPixel: null };
}
