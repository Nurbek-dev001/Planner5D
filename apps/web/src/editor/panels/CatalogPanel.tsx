import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Search } from 'lucide-react';
import { CATALOG_CATEGORIES, CATALOG_ITEMS, formatPrice, type CatalogCategoryId, type CatalogItem } from '@spaceplan/shared';
import { api } from '../../api/client';
import { drawSymbol } from '../symbols2d';
import { placeCatalogItem } from '../placement';
import { viewport } from '../viewport';
import { useEditor } from '../store';

function Thumb({ item }: { item: CatalogItem }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext('2d')!;
    const size = 56;
    c.clearRect(0, 0, size, size);
    const k = (size - 8) / Math.max(item.width, item.depth, 1);
    c.save();
    c.translate(size / 2, size / 2);
    c.scale(k, k);
    drawSymbol(c, item.model, item.width, Math.max(item.depth, 2), item.color, 1 / k);
    c.restore();
  }, [item]);
  return <canvas ref={ref} width={56} height={56} className="h-14 w-14" />;
}

let cachedItems: CatalogItem[] | null = null;

/** Furniture catalog (docs, section 11) with drag & drop onto the plan (section 13) */
export function CatalogPanel() {
  const [items, setItems] = useState<CatalogItem[]>(cachedItems ?? CATALOG_ITEMS);
  const [category, setCategory] = useState<CatalogCategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const view = useEditor((s) => s.view);

  useEffect(() => {
    if (cachedItems) return;
    api
      .catalogItems()
      .then(({ items }) => {
        // Only items known to the client-side renderer can be placed
        cachedItems = items.filter((i) => CATALOG_ITEMS.some((c) => c.id === i.id));
        setItems(cachedItems);
      })
      .catch(() => {
        /* offline / demo: bundled catalog */
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (category === 'all' || i.category === category) && (!q || i.name.toLowerCase().includes(q) || i.subcategory.toLowerCase().includes(q)));
  }, [items, category, search]);

  const add = (item: CatalogItem) => {
    if (view === '3d') {
      const s = useEditor.getState();
      const floor = s.project.floors.find((f) => f.id === s.floorId)!;
      const room = floor.rooms[0];
      const at = room ? room.polygon.reduce((a, p) => ({ x: a.x + p.x / room.polygon.length, y: a.y + p.y / room.polygon.length }), { x: 0, y: 0 }) : viewport.center;
      placeCatalogItem(item.id, at);
    } else {
      placeCatalogItem(item.id, viewport.center);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 p-3">
        <div className="relative">
          <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-gray-400" />
          <input className="input-sm pl-8" placeholder="Поиск мебели…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {[{ id: 'all' as const, name: 'Все' }, ...CATALOG_CATEGORIES].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs ${category === c.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-3 pb-3">
        {filtered.map((item) => (
          <button
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-spaceplan-item', item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => add(item)}
            title={`${item.name}\n${item.width}×${item.depth}×${item.height} см\nПеретащите на план или кликните`}
            className="group relative flex flex-col items-center rounded-lg border border-gray-200 bg-white p-2 text-center hover:border-brand-500 hover:shadow-sm"
          >
            {item.premium && <Crown size={12} className="absolute top-1.5 right-1.5 text-amber-500" />}
            <Thumb item={item} />
            <span className="mt-1 line-clamp-2 text-[11px] leading-tight text-gray-700">{item.name}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-gray-900">{formatPrice(item.price)}</span>
          </button>
        ))}
        {!filtered.length && <p className="col-span-2 py-6 text-center text-sm text-gray-400">Ничего не найдено</p>}
      </div>
    </div>
  );
}
