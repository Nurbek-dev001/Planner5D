import type { ModelKind } from '@spaceplan/shared';
import { LIGHT_SYMBOLS, type SymbolStyle } from './planTheme';

export { tint } from './planTheme';

/**
 * Top-view plan symbols for furniture. Drawn in local coordinates centred at (0,0),
 * width along X, depth along Y; the back of the object is at -Y (against the wall).
 */
export function drawSymbol(
  c: CanvasRenderingContext2D,
  kind: ModelKind,
  w: number,
  d: number,
  color: string,
  lineWidth: number,
  style: SymbolStyle = LIGHT_SYMBOLS,
) {
  const x0 = -w / 2;
  const y0 = -d / 2;
  const tint = style.fill;
  c.lineWidth = lineWidth;
  c.lineJoin = 'round';
  c.strokeStyle = style.stroke;
  c.fillStyle = tint(color, 0.6);

  const box = (x: number, y: number, bw: number, bh: number, r = 0) => {
    c.beginPath();
    if (r > 0 && c.roundRect) c.roundRect(x, y, bw, bh, Math.min(r, bw / 2, bh / 2));
    else c.rect(x, y, bw, bh);
    c.fill();
    c.stroke();
  };
  const circle = (cx: number, cy: number, r: number) => {
    c.beginPath();
    c.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
    c.fill();
    c.stroke();
  };
  const line = (ax: number, ay: number, bx: number, by: number) => {
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
  };

  switch (kind) {
    case 'sofa':
    case 'armchair': {
      box(x0, y0, w, d, 6);
      const back = d * 0.25;
      const arm = Math.min(w * 0.15, 20);
      box(x0, y0, w, back, 4);
      box(x0, y0, arm, d, 4);
      box(-x0 - arm, y0, arm, d, 4);
      const seats = kind === 'armchair' ? 1 : Math.max(2, Math.round((w - 2 * arm) / 65));
      const sw = (w - 2 * arm) / seats;
      for (let i = 1; i < seats; i++) line(x0 + arm + sw * i, y0 + back, x0 + arm + sw * i, -y0);
      break;
    }
    case 'corner-sofa': {
      const depth = Math.min(95, w / 2, d / 2);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(-x0, y0);
      c.lineTo(-x0, y0 + depth);
      c.lineTo(x0 + depth, y0 + depth);
      c.lineTo(x0 + depth, -y0);
      c.lineTo(x0, -y0);
      c.closePath();
      c.fill();
      c.stroke();
      box(x0, y0, w, depth * 0.25, 4);
      box(x0, y0, depth * 0.25, d, 4);
      break;
    }
    case 'bed': {
      box(x0, y0, w, d, 4);
      box(x0, y0, w, 8, 2); // headboard
      const pillows = w > 120 ? 2 : 1;
      const pw = (w - 20) / pillows;
      for (let i = 0; i < pillows; i++) box(x0 + 10 + i * pw + 3, y0 + 14, pw - 6, 30, 6);
      c.fillStyle = tint(color, 0.3);
      box(x0 + 3, y0 + d * 0.35, w - 6, d * 0.62, 4); // blanket
      line(x0 + 3, y0 + d * 0.45, -x0 - 3, y0 + d * 0.45);
      break;
    }
    case 'dining-table':
    case 'coffee-table':
    case 'desk':
      box(x0, y0, w, d, 3);
      if (kind === 'desk') box(x0 + w * 0.3, y0 + 6, w * 0.4, 6, 1);
      break;
    case 'round-table':
    case 'rug':
      c.beginPath();
      c.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (kind === 'rug' && Math.abs(w - d) > 1) {
        c.beginPath();
        c.rect(x0, y0, w, d);
        c.fill();
        c.stroke();
        c.strokeStyle = tint(color, 1);
        c.strokeRect(x0 + 8, y0 + 8, w - 16, d - 16);
      }
      break;
    case 'chair':
    case 'office-chair':
      box(x0 + 2, y0 + d * 0.2, w - 4, d * 0.8, 6);
      box(x0, y0, w, d * 0.22, 4);
      break;
    case 'wardrobe':
    case 'bookshelf':
    case 'dresser':
    case 'kitchen-base':
    case 'kitchen-wall':
    case 'tv-stand':
    case 'nightstand': {
      box(x0, y0, w, d, 1);
      const doors = Math.max(1, Math.round(w / 50));
      for (let i = 1; i < doors; i++) line(x0 + (w / doors) * i, y0, x0 + (w / doors) * i, -y0);
      if (kind === 'wardrobe') line(x0 + 4, 0, -x0 - 4, 0);
      if (kind === 'kitchen-wall') {
        c.setLineDash([lineWidth * 4, lineWidth * 3]);
        line(x0, y0, -x0, -y0);
        c.setLineDash([]);
      }
      break;
    }
    case 'fridge':
    case 'washing-machine':
      box(x0, y0, w, d, 2);
      if (kind === 'washing-machine') circle(0, 0, Math.min(w, d) * 0.3);
      else line(x0, -y0 - 6, -x0, -y0 - 6);
      break;
    case 'stove': {
      box(x0, y0, w, d, 2);
      const r = Math.min(w, d) * 0.14;
      for (const [cx, cy] of [
        [-w / 4, -d / 4],
        [w / 4, -d / 4],
        [-w / 4, d / 4],
        [w / 4, d / 4],
      ])
        circle(cx, cy, r);
      break;
    }
    case 'sink-cabinet':
    case 'washbasin':
      box(x0, y0, w, d, 2);
      c.fillStyle = style.hollow;
      c.beginPath();
      c.ellipse(0, 2, w * 0.3, d * 0.3, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      break;
    case 'bathtub':
      box(x0, y0, w, d, 10);
      c.fillStyle = style.hollow;
      box(x0 + 7, y0 + 7, w - 14, d - 14, Math.min(w, d) * 0.35);
      break;
    case 'shower':
      box(x0, y0, w, d, 0);
      line(x0, y0, -x0, -y0);
      line(-x0, y0, x0, -y0);
      break;
    case 'toilet':
      box(x0, y0, w, d * 0.28, 3);
      c.beginPath();
      c.ellipse(0, y0 + d * 0.62, w * 0.45, d * 0.36, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      break;
    case 'plant': {
      c.strokeStyle = style.plant;
      c.fillStyle = tint(style.plant, 0.5);
      circle(0, 0, Math.min(w, d) / 2);
      c.fillStyle = tint(style.plant, 0.9);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle((Math.cos(a) * w) / 5, (Math.sin(a) * d) / 5, Math.min(w, d) / 6);
      }
      break;
    }
    case 'ceiling-light':
    case 'floor-lamp':
    case 'wall-lamp': {
      c.fillStyle = style.light;
      circle(0, 0, Math.min(w, d) / 2);
      const r = Math.min(w, d) / 2;
      line(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7);
      line(-r * 0.7, r * 0.7, r * 0.7, -r * 0.7);
      break;
    }
    case 'tv':
    case 'computer':
      c.fillStyle = style.solid;
      box(x0, y0, w, Math.max(d, 4), 1);
      break;
    case 'mirror':
    case 'painting':
      c.fillStyle = kind === 'mirror' ? style.glass : tint(color, 1);
      box(x0, y0, w, Math.max(d, 3), 0);
      break;
    default:
      box(x0, y0, w, d, 2);
  }
}
