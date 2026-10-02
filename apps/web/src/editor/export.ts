import { jsPDF } from 'jspdf';
import { calculateBudget, formatArea, formatLength, formatPrice, roomArea, roomDimensions, type ProjectData } from '@spaceplan/shared';
import { useEditor } from './store';
import { viewport } from './viewport';

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const safeName = (name: string) => name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'project';

/** Snapshot of the active view (2D plan or 3D scene) on a white background */
function captureView(): HTMLCanvasElement | null {
  const { view } = useEditor.getState();
  let src: HTMLCanvasElement | null = null;
  if (view === '3d') src = viewport.canvas3d;
  else if (viewport.stage) src = viewport.stage.toCanvas({ pixelRatio: 2 });
  if (!src) return null;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const c = out.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(src, 0, 0);
  return out;
}

export function exportImage(name: string, format: 'png' | 'jpg') {
  const canvas = captureView();
  if (!canvas) return;
  download(canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.92), `${safeName(name)}.${format}`);
}

/** Saves the finished photoreal render exactly as shown on the 3D canvas */
export function exportPhoto(name: string) {
  const canvas = viewport.canvas3d;
  if (!canvas) return;
  download(canvas.toDataURL('image/png'), `${safeName(name)}-render.png`);
}

export function exportJson(name: string, data: ProjectData) {
  const blob = new Blob([JSON.stringify({ name, data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(url, `${safeName(name)}.spaceplan.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * PDF with the current view, room schedule and budget summary. The page is composed on a
 * canvas first so that Cyrillic text renders without embedding fonts into the PDF.
 */
export function exportPdf(name: string) {
  const view = captureView();
  const { project, floorId } = useEditor.getState();
  const floor = project.floors.find((f) => f.id === floorId)!;
  const budget = calculateBudget(project);
  const W = 1654; // A4 landscape @ 150 dpi
  const H = 1169;
  const page = document.createElement('canvas');
  page.width = W;
  page.height = H;
  const c = page.getContext('2d')!;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#111827';
  c.font = 'bold 40px Inter, Arial, sans-serif';
  c.fillText(name, 60, 80);
  c.font = '22px Inter, Arial, sans-serif';
  c.fillStyle = '#6b7280';
  c.fillText(`${floor.name} · SpacePlan · ${new Date().toLocaleDateString('ru-RU')}`, 60, 118);

  if (view) {
    const maxW = 1000;
    const maxH = 980;
    const k = Math.min(maxW / view.width, maxH / view.height);
    c.drawImage(view, 60, 150, view.width * k, view.height * k);
    c.strokeStyle = '#e5e7eb';
    c.strokeRect(60, 150, view.width * k, view.height * k);
  }

  let y = 170;
  const x = 1110;
  c.fillStyle = '#111827';
  c.font = 'bold 26px Inter, Arial, sans-serif';
  c.fillText('Помещения', x, y);
  y += 40;
  c.font = '20px Inter, Arial, sans-serif';
  for (const r of floor.rooms) {
    const d = roomDimensions(r, floor.walls);
    c.fillStyle = '#111827';
    c.fillText(r.name, x, y);
    c.fillStyle = '#6b7280';
    c.fillText(`${formatLength(d.width, project.units)} × ${formatLength(d.length, project.units)}   ${formatArea(roomArea(r, floor.walls), project.units)}`, x, y + 26);
    y += 62;
    if (y > 700) break;
  }
  y += 20;
  c.fillStyle = '#111827';
  c.font = 'bold 26px Inter, Arial, sans-serif';
  c.fillText('Смета', x, y);
  y += 40;
  c.font = '20px Inter, Arial, sans-serif';
  for (const cat of budget.byCategory) {
    c.fillStyle = '#374151';
    c.fillText(cat.category, x, y);
    c.textAlign = 'right';
    c.fillText(formatPrice(cat.total), W - 60, y);
    c.textAlign = 'left';
    y += 32;
  }
  c.font = 'bold 24px Inter, Arial, sans-serif';
  c.fillStyle = '#1d4ed8';
  c.fillText('Итого', x, y + 10);
  c.textAlign = 'right';
  c.fillText(formatPrice(budget.total), W - 60, y + 10);
  c.textAlign = 'left';

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(page.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 297, 210);
  pdf.save(`${safeName(name)}.pdf`);
}
