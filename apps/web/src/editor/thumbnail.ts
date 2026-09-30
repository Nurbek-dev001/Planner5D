import { boundingBox, getMaterial, roomInnerPolygon, DEFAULT_FLOOR_MATERIAL, type Floor } from '@spaceplan/shared';
import { tint } from './symbols2d';

/** Small top-down preview of a floor for dashboard cards (independent of the live canvas) */
export function renderThumbnail(floor: Floor, width = 320, height = 200): string | null {
  const pts = floor.walls.flatMap((w) => [w.start, w.end]);
  if (!pts.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.fillStyle = '#f8fafc';
  c.fillRect(0, 0, width, height);
  const bb = boundingBox(pts);
  const k = Math.min((width - 24) / Math.max(bb.width, 1), (height - 24) / Math.max(bb.height, 1));
  c.translate(width / 2 - (bb.minX + bb.width / 2) * k, height / 2 - (bb.minY + bb.height / 2) * k);
  c.scale(k, k);
  for (const r of floor.rooms) {
    const poly = roomInnerPolygon(r.polygon, floor.walls);
    c.beginPath();
    poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = tint(getMaterial(r.floorMaterialId, DEFAULT_FLOOR_MATERIAL).baseColor, 0.45);
    c.fill();
  }
  for (const o of floor.objects) {
    c.save();
    c.translate(o.position.x, o.position.y);
    c.rotate((o.rotation * Math.PI) / 180);
    c.fillStyle = tint(o.color ?? '#94a3b8', 0.6);
    c.fillRect(-o.width / 2, -o.depth / 2, o.width, o.depth);
    c.restore();
  }
  c.strokeStyle = '#334155';
  c.lineCap = 'square';
  for (const w of floor.walls) {
    c.lineWidth = w.thickness;
    c.beginPath();
    c.moveTo(w.start.x, w.start.y);
    c.lineTo(w.end.x, w.end.y);
    c.stroke();
  }
  return canvas.toDataURL('image/png');
}
