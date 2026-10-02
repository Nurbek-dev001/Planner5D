import type { CatalogCategory, CatalogItem, ModelKind } from './types';

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: 'living', name: 'Гостиная', subcategories: ['Диваны', 'Кресла', 'TV', 'Столы', 'Шкафы'] },
  { id: 'bedroom', name: 'Спальня', subcategories: ['Кровати', 'Тумбы', 'Шкафы', 'Комоды'] },
  { id: 'kitchen', name: 'Кухня', subcategories: ['Кухонные модули', 'Техника', 'Столы', 'Стулья'] },
  { id: 'bathroom', name: 'Ванная', subcategories: ['Ванны', 'Душевые', 'Раковины', 'Туалеты', 'Техника'] },
  { id: 'office', name: 'Офис', subcategories: ['Столы', 'Кресла', 'Шкафы', 'Техника'] },
  { id: 'decor', name: 'Декор', subcategories: ['Растения', 'Картины', 'Ковры', 'Зеркала'] },
  { id: 'lighting', name: 'Освещение', subcategories: ['Потолочные', 'Торшеры', 'Бра'] },
];

interface Base {
  key: string;
  name: string;
  category: CatalogItem['category'];
  subcategory: string;
  model: ModelKind;
  size: [number, number, number]; // width, depth, height (cm)
  price: number;
  color: string;
  materialId?: string;
  elevation?: number;
  premium?: boolean;
  wallMounted?: boolean;
  light?: boolean;
  manufacturer?: string;
  /** Real 3D model (GLB, relative to the web app's base URL); the procedural `model` is the fallback */
  modelUrl?: string;
  /** Extra variants of the same model (size / finish / price) */
  variants?: {
    suffix: string;
    size?: [number, number, number];
    price: number;
    color?: string;
    materialId?: string;
    premium?: boolean;
    elevation?: number;
  }[];
}

const BASES: Base[] = [
  // Living room
  { key: 'sofa', name: 'Диван', category: 'living', subcategory: 'Диваны', model: 'sofa', size: [210, 95, 85], price: 289990, color: '#8c8f93', materialId: 'furn-fabric-grey',
    variants: [
      { suffix: '2-местный', size: [160, 90, 85], price: 199990, color: '#d5c6ad', materialId: 'furn-fabric-beige' },
      { suffix: '3-местный кожаный', size: [230, 100, 85], price: 549990, color: '#6b4028', materialId: 'furn-leather-brown', premium: true },
      { suffix: 'велюровый', size: [220, 95, 80], price: 379990, color: '#46624f', materialId: 'furn-fabric-green' },
    ] },
  { key: 'corner-sofa', name: 'Угловой диван', category: 'living', subcategory: 'Диваны', model: 'corner-sofa', size: [270, 180, 85], price: 449990, color: '#8c8f93', materialId: 'furn-fabric-grey', manufacturer: 'Partner',
    variants: [{ suffix: 'X21 бежевый', price: 349990, color: '#d5c6ad', materialId: 'furn-fabric-beige' }] },
  { key: 'armchair', name: 'Кресло', category: 'living', subcategory: 'Кресла', model: 'armchair', size: [85, 85, 90], price: 119990, color: '#d5c6ad', materialId: 'furn-fabric-beige',
    variants: [
      { suffix: 'кожаное', price: 219990, color: '#262626', materialId: 'furn-leather-black', premium: true },
      { suffix: 'зелёное', price: 139990, color: '#46624f', materialId: 'furn-fabric-green' },
    ] },
  { key: 'coffee-table', name: 'Журнальный столик', category: 'living', subcategory: 'Столы', model: 'coffee-table', size: [110, 60, 42], price: 64990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [
      { suffix: 'стеклянный', price: 89990, color: '#cfe3ea', materialId: 'furn-glass' },
      { suffix: 'орех', size: [120, 70, 40], price: 99990, color: '#5f3f2a', materialId: 'furn-wood-walnut' },
    ] },
  { key: 'tv', name: 'Телевизор 55"', category: 'living', subcategory: 'TV', model: 'tv', size: [123, 8, 72], price: 259990, color: '#1b1b1d', elevation: 50,
    variants: [
      { suffix: '65"', size: [145, 8, 84], price: 399990 },
      { suffix: '75" OLED', size: [168, 6, 97], price: 899990, premium: true },
    ] },
  { key: 'tv-stand', name: 'ТВ-тумба', category: 'living', subcategory: 'Шкафы', model: 'tv-stand', size: [180, 40, 50], price: 89990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [{ suffix: 'дуб', size: [200, 42, 48], price: 119990, color: '#b88a5b', materialId: 'furn-wood-oak' }] },
  { key: 'bookshelf', name: 'Стеллаж', category: 'living', subcategory: 'Шкафы', model: 'bookshelf', size: [90, 35, 200], price: 74990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [{ suffix: 'широкий', size: [160, 35, 200], price: 119990, color: '#f2f2f0', materialId: 'furn-wood-white' }] },

  // Bedroom
  { key: 'bed-double', name: 'Кровать двуспальная', category: 'bedroom', subcategory: 'Кровати', model: 'bed', size: [170, 215, 100], price: 249990, color: '#d5c6ad', materialId: 'furn-fabric-beige',
    variants: [
      { suffix: '180×200', size: [190, 220, 105], price: 329990, color: '#8c8f93', materialId: 'furn-fabric-grey' },
      { suffix: 'King 200×200 кожа', size: [215, 225, 115], price: 689990, color: '#6b4028', materialId: 'furn-leather-brown', premium: true },
    ] },
  { key: 'bed-single', name: 'Кровать односпальная', category: 'bedroom', subcategory: 'Кровати', model: 'bed', size: [100, 210, 90], price: 139990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [{ suffix: 'детская', size: [90, 190, 80], price: 99990, color: '#a9c7e8' }] },
  { key: 'nightstand', name: 'Прикроватная тумба', category: 'bedroom', subcategory: 'Тумбы', model: 'nightstand', size: [45, 40, 50], price: 34990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [{ suffix: 'белая', price: 29990, color: '#f2f2f0', materialId: 'furn-wood-white' }] },
  { key: 'wardrobe', name: 'Шкаф-купе', category: 'bedroom', subcategory: 'Шкафы', model: 'wardrobe', size: [180, 60, 230], price: 259990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [
      { suffix: 'двухстворчатый', size: [100, 58, 210], price: 149990, color: '#b88a5b', materialId: 'furn-wood-oak' },
      { suffix: 'угловой большой', size: [240, 62, 240], price: 459990, color: '#5f3f2a', materialId: 'furn-wood-walnut', premium: true },
    ] },
  { key: 'dresser', name: 'Комод', category: 'bedroom', subcategory: 'Комоды', model: 'dresser', size: [120, 45, 85], price: 99990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [{ suffix: 'белый', size: [80, 45, 100], price: 79990, color: '#f2f2f0', materialId: 'furn-wood-white' }] },

  // Kitchen
  { key: 'kitchen-base', name: 'Кухонный модуль напольный', category: 'kitchen', subcategory: 'Кухонные модули', model: 'kitchen-base', size: [60, 60, 90], price: 69990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [
      { suffix: '80 см', size: [80, 60, 90], price: 84990 },
      { suffix: '120 см', size: [120, 60, 90], price: 119990 },
      { suffix: 'дуб 60 см', price: 89990, color: '#b88a5b', materialId: 'furn-wood-oak' },
    ] },
  { key: 'kitchen-wall', name: 'Кухонный модуль навесной', category: 'kitchen', subcategory: 'Кухонные модули', model: 'kitchen-wall', size: [60, 35, 70], price: 44990, color: '#f2f2f0', materialId: 'furn-wood-white', elevation: 145, wallMounted: true,
    variants: [{ suffix: '80 см', size: [80, 35, 70], price: 54990 }] },
  { key: 'sink-cabinet', name: 'Модуль с мойкой', category: 'kitchen', subcategory: 'Кухонные модули', model: 'sink-cabinet', size: [80, 60, 90], price: 119990, color: '#f2f2f0', materialId: 'furn-wood-white' },
  { key: 'fridge', name: 'Холодильник', category: 'kitchen', subcategory: 'Техника', model: 'fridge', size: [60, 65, 185], price: 299990, color: '#c6c8cb', materialId: 'furn-metal-steel',
    variants: [
      { suffix: 'Side-by-Side', size: [90, 72, 178], price: 699990, premium: true },
      { suffix: 'белый', price: 249990, color: '#f2f2f0' },
    ] },
  { key: 'stove', name: 'Плита', category: 'kitchen', subcategory: 'Техника', model: 'stove', size: [60, 60, 85], price: 189990, color: '#c6c8cb', materialId: 'furn-metal-steel',
    variants: [{ suffix: 'чёрная', price: 209990, color: '#2a2a2c', materialId: 'furn-metal-black' }] },
  { key: 'dining-table', name: 'Обеденный стол', category: 'kitchen', subcategory: 'Столы', model: 'dining-table', size: [160, 90, 75], price: 159990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [
      { suffix: 'на 4 персоны', size: [120, 80, 75], price: 109990 },
      { suffix: 'орех на 8 персон', size: [220, 100, 76], price: 389990, color: '#5f3f2a', materialId: 'furn-wood-walnut', premium: true },
    ] },
  { key: 'round-table', name: 'Круглый стол', category: 'kitchen', subcategory: 'Столы', model: 'round-table', size: [100, 100, 75], price: 119990, color: '#f2f2f0', materialId: 'furn-wood-white' },
  { key: 'chair', name: 'Стул', category: 'kitchen', subcategory: 'Стулья', model: 'chair', size: [45, 50, 90], price: 29990, color: '#b88a5b', materialId: 'furn-wood-oak',
    variants: [
      { suffix: 'мягкий', price: 44990, color: '#8c8f93', materialId: 'furn-fabric-grey' },
      { suffix: 'металлический', price: 34990, color: '#2a2a2c', materialId: 'furn-metal-black' },
    ] },

  // Bathroom
  { key: 'bathtub', name: 'Ванна', category: 'bathroom', subcategory: 'Ванны', model: 'bathtub', size: [170, 75, 58], price: 189990, color: '#fafafa',
    variants: [
      { suffix: '150 см', size: [150, 70, 58], price: 149990 },
      { suffix: 'отдельностоящая', size: [175, 80, 62], price: 649990, premium: true },
    ] },
  { key: 'shower', name: 'Душевая кабина', category: 'bathroom', subcategory: 'Душевые', model: 'shower', size: [90, 90, 210], price: 229990, color: '#cfe3ea', materialId: 'furn-glass',
    variants: [{ suffix: '120×80', size: [120, 80, 210], price: 289990 }] },
  { key: 'washbasin', name: 'Раковина с тумбой', category: 'bathroom', subcategory: 'Раковины', model: 'washbasin', size: [60, 46, 85], price: 89990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [{ suffix: '80 см дуб', size: [80, 48, 85], price: 139990, color: '#b88a5b', materialId: 'furn-wood-oak' }] },
  { key: 'toilet', name: 'Унитаз', category: 'bathroom', subcategory: 'Туалеты', model: 'toilet', size: [38, 65, 78], price: 79990, color: '#fafafa',
    variants: [{ suffix: 'подвесной', size: [36, 54, 40], price: 159990, premium: true }] },
  { key: 'washing-machine', name: 'Стиральная машина', category: 'bathroom', subcategory: 'Техника', model: 'washing-machine', size: [60, 55, 85], price: 219990, color: '#f5f5f5' },

  // Office
  { key: 'desk', name: 'Письменный стол', category: 'office', subcategory: 'Столы', model: 'desk', size: [140, 70, 75], price: 89990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [
      { suffix: 'дуб', size: [160, 75, 75], price: 139990, color: '#b88a5b', materialId: 'furn-wood-oak' },
      { suffix: 'компактный', size: [100, 60, 75], price: 59990 },
    ] },
  { key: 'office-chair', name: 'Офисное кресло', category: 'office', subcategory: 'Кресла', model: 'office-chair', size: [65, 65, 115], price: 79990, color: '#262626', materialId: 'furn-leather-black',
    variants: [{ suffix: 'эргономичное', price: 229990, color: '#8c8f93', materialId: 'furn-fabric-grey', premium: true }] },
  { key: 'office-shelf', name: 'Офисный шкаф', category: 'office', subcategory: 'Шкафы', model: 'bookshelf', size: [80, 40, 180], price: 69990, color: '#8c8f93', materialId: 'furn-metal-steel' },
  { key: 'computer', name: 'Компьютер (монитор)', category: 'office', subcategory: 'Техника', model: 'computer', size: [60, 20, 45], price: 449990, color: '#1b1b1d', elevation: 75 },

  // Decor
  { key: 'plant', name: 'Растение в кашпо', category: 'decor', subcategory: 'Растения', model: 'plant', size: [45, 45, 120], price: 24990, color: '#4f7d4a',
    variants: [
      { suffix: 'маленькое', size: [25, 25, 45], price: 7990 },
      { suffix: 'Монстера', size: [70, 70, 160], price: 49990, premium: true },
    ] },
  { key: 'painting', name: 'Картина', category: 'decor', subcategory: 'Картины', model: 'painting', size: [80, 4, 60], price: 29990, color: '#c3934b', elevation: 140, wallMounted: true,
    variants: [{ suffix: 'большая', size: [140, 4, 90], price: 69990, color: '#3f6f8f' }] },
  { key: 'rug', name: 'Ковёр', category: 'decor', subcategory: 'Ковры', model: 'rug', size: [200, 140, 1], price: 59990, color: '#b9a58a',
    variants: [
      { suffix: 'большой', size: [300, 200, 1], price: 119990, color: '#7a6a8a' },
      { suffix: 'круглый', size: [160, 160, 1], price: 49990, color: '#9c3d3d' },
    ] },
  { key: 'mirror', name: 'Зеркало', category: 'decor', subcategory: 'Зеркала', model: 'mirror', size: [60, 3, 90], price: 34990, color: '#dfe8ec', elevation: 110, wallMounted: true,
    variants: [{ suffix: 'в пол', size: [70, 4, 180], price: 69990, elevation: 0 }] },

  // Extra MVP assortment (hallway, kids, dining)
  { key: 'shoe-cabinet', name: 'Обувница', category: 'living', subcategory: 'Шкафы', model: 'dresser', size: [100, 35, 55], price: 44990, color: '#f2f2f0', materialId: 'furn-wood-white',
    variants: [{ suffix: 'дуб', price: 54990, color: '#b88a5b', materialId: 'furn-wood-oak' }] },
  { key: 'hall-wardrobe', name: 'Шкаф для прихожей', category: 'living', subcategory: 'Шкафы', model: 'wardrobe', size: [120, 45, 220], price: 169990, color: '#b88a5b', materialId: 'furn-wood-oak' },
  { key: 'pouf', name: 'Пуф', category: 'living', subcategory: 'Кресла', model: 'armchair', size: [50, 50, 45], price: 24990, color: '#d5c6ad', materialId: 'furn-fabric-beige',
    variants: [{ suffix: 'велюровый', price: 32990, color: '#46624f', materialId: 'furn-fabric-green' }] },
  { key: 'console', name: 'Консоль', category: 'living', subcategory: 'Столы', model: 'desk', size: [110, 35, 80], price: 69990, color: '#5f3f2a', materialId: 'furn-wood-walnut' },
  { key: 'kids-desk', name: 'Детский стол', category: 'bedroom', subcategory: 'Кровати', model: 'desk', size: [90, 55, 60], price: 39990, color: '#a9c7e8' },
  { key: 'bunk-wardrobe', name: 'Детский шкаф', category: 'bedroom', subcategory: 'Шкафы', model: 'wardrobe', size: [80, 50, 180], price: 89990, color: '#a9c7e8' },
  { key: 'bar-stool', name: 'Барный стул', category: 'kitchen', subcategory: 'Стулья', model: 'chair', size: [42, 45, 105], price: 39990, color: '#2a2a2c', materialId: 'furn-metal-black',
    variants: [{ suffix: 'дуб', price: 44990, color: '#b88a5b', materialId: 'furn-wood-oak' }] },
  { key: 'kitchen-island', name: 'Кухонный остров', category: 'kitchen', subcategory: 'Кухонные модули', model: 'kitchen-base', size: [180, 90, 90], price: 289990, color: '#f2f2f0', materialId: 'furn-wood-white', premium: true },
  { key: 'bath-cabinet', name: 'Пенал для ванной', category: 'bathroom', subcategory: 'Раковины', model: 'wardrobe', size: [40, 35, 170], price: 59990, color: '#f2f2f0', materialId: 'furn-wood-white' },
  { key: 'bath-mirror', name: 'Зеркало для ванной', category: 'bathroom', subcategory: 'Раковины', model: 'mirror', size: [60, 3, 80], price: 29990, color: '#dfe8ec', elevation: 110, wallMounted: true },
  { key: 'office-desk-l', name: 'Угловой стол', category: 'office', subcategory: 'Столы', model: 'desk', size: [160, 120, 75], price: 169990, color: '#8c8f93', materialId: 'furn-metal-steel' },
  { key: 'plant-tall', name: 'Фикус', category: 'decor', subcategory: 'Растения', model: 'plant', size: [60, 60, 180], price: 59990, color: '#3f6b3a' },
  { key: 'painting-set', name: 'Постер', category: 'decor', subcategory: 'Картины', model: 'painting', size: [50, 3, 70], price: 14990, color: '#d9a441', elevation: 150, wallMounted: true,
    variants: [
      { suffix: 'абстракция', price: 19990, color: '#9c3d3d' },
      { suffix: 'пейзаж', size: [100, 3, 70], price: 34990, color: '#4f7d4a' },
    ] },
  { key: 'rug-runner', name: 'Ковровая дорожка', category: 'decor', subcategory: 'Ковры', model: 'rug', size: [80, 250, 1], price: 29990, color: '#6b7280' },
  { key: 'spotlight', name: 'Точечный светильник', category: 'lighting', subcategory: 'Потолочные', model: 'ceiling-light', size: [12, 12, 8], price: 7990, color: '#ffffff', elevation: 272, light: true },
  { key: 'pendant', name: 'Подвесной светильник', category: 'lighting', subcategory: 'Потолочные', model: 'ceiling-light', size: [35, 35, 80], price: 44990, color: '#2a2a2c', elevation: 190, light: true },

  // Lighting
  { key: 'ceiling-light', name: 'Люстра', category: 'lighting', subcategory: 'Потолочные', model: 'ceiling-light', size: [60, 60, 30], price: 59990, color: '#f3e7c9', elevation: 240, light: true,
    variants: [{ suffix: 'плафон LED', size: [45, 45, 10], price: 24990, color: '#ffffff' }] },
  { key: 'floor-lamp', name: 'Торшер', category: 'lighting', subcategory: 'Торшеры', model: 'floor-lamp', size: [40, 40, 165], price: 39990, color: '#2a2a2c', light: true,
    variants: [{ suffix: 'латунь', price: 64990, color: '#c6a15b', premium: true }] },
  { key: 'wall-lamp', name: 'Бра', category: 'lighting', subcategory: 'Бра', model: 'wall-lamp', size: [20, 20, 25], price: 19990, color: '#c6a15b', elevation: 170, wallMounted: true, light: true },

  // Photoreal 3D models (scanned designer furniture, see apps/web/public/models/CREDITS.md)
  { key: 'sofa-glam', name: 'Диван Glam велюр', category: 'living', subcategory: 'Диваны', model: 'sofa', size: [219, 102, 79], price: 489990, color: '#c9b9a6', manufacturer: 'Wayfair 3D', modelUrl: 'models/GlamVelvetSofa.glb', premium: true },
  { key: 'sofa-leather-wood', name: 'Диван кожаный на дереве', category: 'living', subcategory: 'Диваны', model: 'sofa', size: [273, 92, 112], price: 789990, color: '#6b4028', manufacturer: 'Wayfair 3D', modelUrl: 'models/SheenWoodLeatherSofa.glb', premium: true },
  { key: 'armchair-sheen', name: 'Кресло Sheen', category: 'living', subcategory: 'Кресла', model: 'armchair', size: [83, 57, 69], price: 179990, color: '#7a8a9a', manufacturer: 'Wayfair 3D', modelUrl: 'models/SheenChair.glb', premium: true },
  { key: 'armchair-damask', name: 'Кресло Damask', category: 'living', subcategory: 'Кресла', model: 'armchair', size: [83, 57, 69], price: 199990, color: '#5b3a6b', manufacturer: 'Wayfair 3D', modelUrl: 'models/ChairDamaskPurplegold.glb', premium: true },
  { key: 'floor-lamp-arc', name: 'Торшер дизайнерский', category: 'lighting', subcategory: 'Торшеры', model: 'floor-lamp', size: [113, 72, 186], price: 129990, color: '#2a2a2c', manufacturer: 'SpacePlan 3D', modelUrl: 'models/LightsPunctualLamp.glb', light: true, premium: true },
  { key: 'table-lamp', name: 'Настольная лампа', category: 'lighting', subcategory: 'Торшеры', model: 'floor-lamp', size: [30, 30, 48], price: 34990, color: '#c6c8cb', manufacturer: 'Wayfair 3D', modelUrl: 'models/IridescenceLamp.glb', elevation: 50, light: true },
  { key: 'plant-pot', name: 'Растение в горшке', category: 'decor', subcategory: 'Растения', model: 'plant', size: [70, 66, 84], price: 32990, color: '#4f7d4a', manufacturer: 'SpacePlan 3D', modelUrl: 'models/DiffuseTransmissionPlant.glb' },
  { key: 'vase-flowers', name: 'Ваза с цветами', category: 'decor', subcategory: 'Растения', model: 'plant', size: [22, 14, 20], price: 12990, color: '#d9a7b0', manufacturer: 'SpacePlan 3D', modelUrl: 'models/GlassVaseFlowers.glb', elevation: 42 },
];

function build(): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (const b of BASES) {
    const base: CatalogItem = {
      id: b.key,
      name: b.name,
      category: b.category,
      subcategory: b.subcategory,
      model: b.model,
      modelUrl: b.modelUrl ?? null,
      thumbnail: null,
      width: b.size[0],
      depth: b.size[1],
      height: b.size[2],
      elevation: b.elevation ?? 0,
      manufacturer: b.manufacturer ?? 'SpacePlan Basic',
      price: b.price,
      currency: 'KZT',
      color: b.color,
      materialId: b.materialId,
      premium: b.premium ?? false,
      wallMounted: b.wallMounted ?? false,
      light: b.light ?? false,
    };
    items.push(base);
    (b.variants ?? []).forEach((v, i) => {
      const size = v.size ?? b.size;
      items.push({
        ...base,
        id: `${b.key}-v${i + 1}`,
        name: `${b.name} ${v.suffix}`,
        width: size[0],
        depth: size[1],
        height: size[2],
        elevation: v.elevation ?? base.elevation,
        price: v.price,
        color: v.color ?? b.color,
        materialId: v.materialId ?? b.materialId,
        premium: v.premium ?? false,
      });
    });
  }
  return items;
}

/** Base furniture catalog (docs, sections 11–12). Seeded into the database by the API. */
export const CATALOG_ITEMS: CatalogItem[] = build();

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG_ITEMS.map((i) => [i.id, i]));
