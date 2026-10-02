import type { Material } from './types';

/** Base material library (docs, section 16). Prices are indicative, KZT per m². */
export const MATERIALS: Material[] = [
  // Walls
  { id: 'wall-paint-white', name: 'Краска белая', target: 'wall', baseColor: '#f4f2ee', pattern: 'none', roughness: 0.9, metallic: 0, scale: 100, pricePerM2: 1800 },
  { id: 'wall-paint-beige', name: 'Краска бежевая', target: 'wall', baseColor: '#e8dcc8', pattern: 'none', roughness: 0.9, metallic: 0, scale: 100, pricePerM2: 1800 },
  { id: 'wall-paint-grey', name: 'Краска серая', target: 'wall', baseColor: '#b9bcbf', pattern: 'none', roughness: 0.9, metallic: 0, scale: 100, pricePerM2: 1800 },
  { id: 'wall-paint-sage', name: 'Краска шалфей', target: 'wall', baseColor: '#a9b8a0', pattern: 'none', roughness: 0.9, metallic: 0, scale: 100, pricePerM2: 2000 },
  { id: 'wall-paint-navy', name: 'Краска тёмно-синяя', target: 'wall', baseColor: '#34445c', pattern: 'none', roughness: 0.9, metallic: 0, scale: 100, pricePerM2: 2200 },
  { id: 'wall-wallpaper-stripes', name: 'Обои в полоску', target: 'wall', baseColor: '#e9e1d3', pattern: 'wallpaper', roughness: 0.85, metallic: 0, scale: 60, pricePerM2: 3500 },
  { id: 'wall-concrete', name: 'Бетон', target: 'wall', baseColor: '#9d9d99', pattern: 'concrete', roughness: 0.95, metallic: 0, scale: 150, pricePerM2: 6500 },
  { id: 'wall-brick', name: 'Кирпич', target: 'wall', baseColor: '#a0543b', pattern: 'brick', roughness: 0.95, metallic: 0, scale: 80, pricePerM2: 9000 },
  { id: 'wall-wood', name: 'Деревянные панели', target: 'wall', baseColor: '#9b7048', pattern: 'planks', roughness: 0.7, metallic: 0, scale: 120, pricePerM2: 14000 },
  { id: 'wall-plaster', name: 'Декоративная штукатурка', target: 'wall', baseColor: '#d8cfc2', pattern: 'plaster', roughness: 0.95, metallic: 0, scale: 120, pricePerM2: 7500 },
  { id: 'wall-tile-white', name: 'Плитка настенная белая', target: 'wall', baseColor: '#f1f1f1', pattern: 'tiles', roughness: 0.3, metallic: 0, scale: 30, pricePerM2: 8000 },

  // Floors
  { id: 'floor-laminate-oak', name: 'Ламинат дуб', target: 'floor', baseColor: '#c49a6c', pattern: 'planks', roughness: 0.6, metallic: 0, scale: 120, pricePerM2: 7500 },
  { id: 'floor-laminate-grey', name: 'Ламинат серый', target: 'floor', baseColor: '#a39e97', pattern: 'planks', roughness: 0.6, metallic: 0, scale: 120, pricePerM2: 7000 },
  { id: 'floor-parquet-oak', name: 'Паркет дуб', target: 'floor', baseColor: '#b98a5a', pattern: 'parquet', roughness: 0.5, metallic: 0, scale: 80, pricePerM2: 16000 },
  { id: 'floor-parquet-walnut', name: 'Паркет орех', target: 'floor', baseColor: '#6e4a31', pattern: 'parquet', roughness: 0.5, metallic: 0, scale: 80, pricePerM2: 21000 },
  { id: 'floor-tile-white', name: 'Плитка белая', target: 'floor', baseColor: '#ecebe8', pattern: 'tiles', roughness: 0.35, metallic: 0, scale: 60, pricePerM2: 9000 },
  { id: 'floor-tile-grey', name: 'Плитка серая', target: 'floor', baseColor: '#8f9194', pattern: 'tiles', roughness: 0.4, metallic: 0, scale: 60, pricePerM2: 9500 },
  { id: 'floor-marble', name: 'Мрамор', target: 'floor', baseColor: '#eeeae4', pattern: 'marble', roughness: 0.15, metallic: 0, scale: 120, pricePerM2: 32000 },
  { id: 'floor-carpet-beige', name: 'Ковролин бежевый', target: 'floor', baseColor: '#cbbba3', pattern: 'carpet', roughness: 1, metallic: 0, scale: 50, pricePerM2: 5500 },
  { id: 'floor-concrete', name: 'Наливной пол', target: 'floor', baseColor: '#9fa09c', pattern: 'concrete', roughness: 0.7, metallic: 0, scale: 200, pricePerM2: 8500 },

  // Furniture
  { id: 'furn-wood-oak', name: 'Дерево дуб', target: 'furniture', baseColor: '#b88a5b', pattern: 'planks', roughness: 0.6, metallic: 0, scale: 60 },
  { id: 'furn-wood-walnut', name: 'Дерево орех', target: 'furniture', baseColor: '#5f3f2a', pattern: 'planks', roughness: 0.6, metallic: 0, scale: 60 },
  { id: 'furn-wood-white', name: 'Белый матовый', target: 'furniture', baseColor: '#f2f2f0', pattern: 'none', roughness: 0.7, metallic: 0, scale: 60 },
  { id: 'furn-metal-black', name: 'Металл чёрный', target: 'furniture', baseColor: '#2a2a2c', pattern: 'none', roughness: 0.35, metallic: 0.8, scale: 60 },
  { id: 'furn-metal-steel', name: 'Сталь', target: 'furniture', baseColor: '#c6c8cb', pattern: 'none', roughness: 0.25, metallic: 0.9, scale: 60 },
  { id: 'furn-leather-brown', name: 'Кожа коричневая', target: 'furniture', baseColor: '#6b4028', pattern: 'leather', roughness: 0.45, metallic: 0, scale: 40 },
  { id: 'furn-leather-black', name: 'Кожа чёрная', target: 'furniture', baseColor: '#262626', pattern: 'leather', roughness: 0.45, metallic: 0, scale: 40 },
  { id: 'furn-fabric-grey', name: 'Ткань серая', target: 'furniture', baseColor: '#8c8f93', pattern: 'fabric', roughness: 1, metallic: 0, scale: 20 },
  { id: 'furn-fabric-beige', name: 'Ткань бежевая', target: 'furniture', baseColor: '#d5c6ad', pattern: 'fabric', roughness: 1, metallic: 0, scale: 20 },
  { id: 'furn-fabric-green', name: 'Велюр зелёный', target: 'furniture', baseColor: '#46624f', pattern: 'fabric', roughness: 0.9, metallic: 0, scale: 20 },
  { id: 'furn-glass', name: 'Стекло', target: 'furniture', baseColor: '#cfe3ea', pattern: 'none', roughness: 0.05, metallic: 0.1, scale: 60 },
];

export const MATERIALS_BY_ID: Record<string, Material> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export const DEFAULT_WALL_MATERIAL = 'wall-paint-white';
export const DEFAULT_FLOOR_MATERIAL = 'floor-parquet-oak';

export function getMaterial(id: string | undefined, fallback: string): Material {
  return (id && MATERIALS_BY_ID[id]) || MATERIALS_BY_ID[fallback];
}
