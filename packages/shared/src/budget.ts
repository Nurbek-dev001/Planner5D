import type { CatalogItem, ProjectData } from './types';
import { CATALOG_BY_ID } from './catalog';
import { MATERIALS_BY_ID } from './materials';
import { roomArea, roomInnerPolygon } from './rooms';
import { dist } from './geometry';

export interface BudgetLine {
  category: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Budget {
  lines: BudgetLine[];
  byCategory: { category: string; total: number }[];
  total: number;
}

const DOOR_PRICE: Record<string, number> = { single: 65000, double: 120000, sliding: 95000, glass: 110000, entrance: 180000 };
const WINDOW_PRICE_PER_M2 = 55000;

/**
 * Approximate project cost in KZT (docs, sections 27 and 54): furniture from the catalog,
 * floor finishing by room area and wall finishing by wall surface.
 */
export function calculateBudget(project: ProjectData, catalog: Record<string, CatalogItem> = CATALOG_BY_ID): Budget {
  const lines: BudgetLine[] = [];
  const furniture = new Map<string, number>();

  for (const floor of project.floors) {
    for (const o of floor.objects) furniture.set(o.catalogItemId, (furniture.get(o.catalogItemId) ?? 0) + 1);

    for (const room of floor.rooms) {
      const mat = MATERIALS_BY_ID[room.floorMaterialId];
      const area = roomArea(room, floor.walls) / 10000;
      if (mat?.pricePerM2) {
        lines.push({ category: 'Напольное покрытие', label: `${room.name}: ${mat.name}`, quantity: round2(area), unit: 'м²', unitPrice: mat.pricePerM2, total: area * mat.pricePerM2 });
      }
      const wallMat = room.wallMaterialId ? MATERIALS_BY_ID[room.wallMaterialId] : undefined;
      if (wallMat?.pricePerM2) {
        const inner = roomInnerPolygon(room.polygon, floor.walls);
        const perimeter = inner.reduce((s, p, i) => s + dist(p, inner[(i + 1) % inner.length]), 0) / 100;
        const wallArea = perimeter * ((room.height ?? floor.height) / 100);
        lines.push({ category: 'Отделка стен', label: `${room.name}: ${wallMat.name}`, quantity: round2(wallArea), unit: 'м²', unitPrice: wallMat.pricePerM2, total: wallArea * wallMat.pricePerM2 });
      }
    }

    for (const o of floor.openings) {
      if (o.kind === 'door') {
        const price = DOOR_PRICE[o.type] ?? 65000;
        lines.push({ category: 'Двери', label: `Дверь (${o.type}) ${o.width} см`, quantity: 1, unit: 'шт', unitPrice: price, total: price });
      } else {
        const m2 = (o.width * o.height) / 10000;
        lines.push({ category: 'Окна', label: `Окно ${o.width}×${o.height} см`, quantity: round2(m2), unit: 'м²', unitPrice: WINDOW_PRICE_PER_M2, total: m2 * WINDOW_PRICE_PER_M2 });
      }
    }
  }

  for (const [id, qty] of furniture) {
    const item = catalog[id];
    if (!item) continue;
    const category = item.category === 'lighting' ? 'Освещение' : item.category === 'decor' ? 'Декор' : 'Мебель';
    lines.push({ category, label: item.name, quantity: qty, unit: 'шт', unitPrice: item.price, total: qty * item.price });
  }

  const cats = new Map<string, number>();
  for (const l of lines) cats.set(l.category, (cats.get(l.category) ?? 0) + l.total);
  const byCategory = [...cats].map(([category, total]) => ({ category, total: Math.round(total) }));
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0));
  return { lines: lines.map((l) => ({ ...l, total: Math.round(l.total) })), byCategory, total };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
