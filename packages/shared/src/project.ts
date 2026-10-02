import type { Door, Floor, PlacedObject, ProjectData, Room, Vec2, Wall, WindowOpening } from './types';
import { uid } from './ids';
import { detectRooms, defaultFloorMaterial, floorArea } from './rooms';
import { CATALOG_BY_ID } from './catalog';
import { DEFAULT_WALL_MATERIAL } from './materials';
import { pointInPolygon, wallLength } from './geometry';

export const DEFAULT_WALL_HEIGHT = 280;
export const DEFAULT_WALL_THICKNESS = 20;
export const DEFAULT_INNER_WALL_THICKNESS = 12;

export function createWall(start: Vec2, end: Vec2, opts: Partial<Wall> = {}): Wall {
  return {
    id: uid('wall'),
    start: { ...start },
    end: { ...end },
    height: DEFAULT_WALL_HEIGHT,
    thickness: DEFAULT_WALL_THICKNESS,
    materialId: DEFAULT_WALL_MATERIAL,
    ...opts,
  };
}

export function createFloor(number = 1, opts: Partial<Floor> = {}): Floor {
  return {
    id: uid('floor'),
    number,
    name: `Этаж ${number}`,
    height: DEFAULT_WALL_HEIGHT,
    walls: [],
    openings: [],
    rooms: [],
    objects: [],
    ...opts,
  };
}

export function createEmptyProject(): ProjectData {
  return {
    schemaVersion: 1,
    units: 'm',
    floors: [createFloor(1)],
    settings: { timeOfDay: 'day', sunAngle: 135, currency: 'KZT' },
  };
}

export function createDoor(wall: Wall, offset: number, opts: Partial<Door> = {}): Door {
  return {
    id: uid('door'),
    kind: 'door',
    type: 'single',
    wallId: wall.id,
    offset,
    width: 80,
    height: 210,
    elevation: 0,
    hinge: 'left',
    swing: 'in',
    color: '#f4f1ea',
    ...opts,
  };
}

export function createWindow(wall: Wall, offset: number, opts: Partial<WindowOpening> = {}): WindowOpening {
  return {
    id: uid('window'),
    kind: 'window',
    type: 'standard',
    wallId: wall.id,
    offset,
    width: 120,
    height: 140,
    elevation: 90,
    color: '#ffffff',
    ...opts,
  };
}

export const DOOR_PRESETS: Record<Door['type'], { name: string; width: number; height: number; color: string }> = {
  single: { name: 'Одностворчатая', width: 80, height: 210, color: '#f4f1ea' },
  double: { name: 'Двустворчатая', width: 140, height: 210, color: '#f4f1ea' },
  sliding: { name: 'Раздвижная', width: 120, height: 210, color: '#d9c7a8' },
  glass: { name: 'Стеклянная', width: 90, height: 210, color: '#cfe3ea' },
  entrance: { name: 'Входная', width: 90, height: 205, color: '#4a3b30' },
};

export const WINDOW_PRESETS: Record<WindowOpening['type'], { name: string; width: number; height: number; elevation: number }> = {
  standard: { name: 'Стандартное', width: 120, height: 140, elevation: 90 },
  double: { name: 'Двойное', width: 180, height: 140, elevation: 90 },
  panoramic: { name: 'Панорамное', width: 240, height: 230, elevation: 10 },
  corner: { name: 'Угловое', width: 150, height: 150, elevation: 80 },
  balcony: { name: 'Балконный блок', width: 150, height: 220, elevation: 0 },
};

export function createObject(catalogItemId: string, position: Vec2, rotation = 0): PlacedObject {
  const item = CATALOG_BY_ID[catalogItemId];
  if (!item) throw new Error(`Unknown catalog item: ${catalogItemId}`);
  return {
    id: uid('obj'),
    catalogItemId,
    position: { x: position.x, y: position.y, z: item.elevation ?? 0 },
    rotation,
    width: item.width,
    depth: item.depth,
    height: item.height,
    color: item.color,
    materialId: item.materialId,
    lightOn: item.light ? true : undefined,
  };
}

/** Closed rectangle of 4 walls with top-left corner at (x, y) */
export function rectangleWalls(x: number, y: number, w: number, h: number, opts: Partial<Wall> = {}): Wall[] {
  const p = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return p.map((a, i) => createWall(a, p[(i + 1) % 4], opts));
}

export function projectArea(project: ProjectData): number {
  return project.floors.reduce((s, f) => s + floorArea(f), 0);
}

/** Remove openings whose wall no longer exists and clamp the rest to their walls */
export function cleanupOpenings(floor: Floor): Floor {
  const walls = new Map(floor.walls.map((w) => [w.id, w]));
  floor.openings = floor.openings.filter((o) => {
    const w = walls.get(o.wallId);
    return w && wallLength(w) >= o.width;
  });
  return floor;
}

// ---------------------------------------------------------------------------
// Templates (docs, section 4 — variant B)
// ---------------------------------------------------------------------------

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'empty', name: 'Пустой проект', description: 'Чистый холст — нарисуйте всё сами' },
  { id: 'studio', name: 'Студия', description: '≈ 32 м², кухня-гостиная и санузел' },
  { id: 'one-room', name: '1-комнатная квартира', description: '≈ 42 м²: комната, кухня, коридор, санузел' },
  { id: 'two-room', name: '2-комнатная квартира', description: '≈ 64 м²: гостиная, спальня, кухня, санузел' },
  { id: 'bedroom', name: 'Спальня', description: 'Одна комната 4.2 × 3.6 м с мебелью' },
];

interface RoomSpec {
  at: Vec2;
  name: string;
  type: Room['type'];
}

function nameRooms(floor: Floor, specs: RoomSpec[]) {
  floor.rooms = detectRooms(floor.walls, []);
  for (const spec of specs) {
    const r = floor.rooms.find((room) => pointInPolygon(spec.at, room.polygon));
    if (r) {
      r.name = spec.name;
      r.type = spec.type;
      r.floorMaterialId = defaultFloorMaterial(spec.type);
    }
  }
}

function inner(a: Vec2, b: Vec2): Wall {
  return createWall(a, b, { thickness: DEFAULT_INNER_WALL_THICKNESS });
}

function place(floor: Floor, id: string, x: number, y: number, rotation = 0) {
  floor.objects.push(createObject(id, { x, y }, rotation));
}

export function createProjectFromTemplate(templateId: string): ProjectData {
  const project = createEmptyProject();
  const floor = project.floors[0];

  if (templateId === 'studio') {
    // 800 × 400 outer
    floor.walls.push(...rectangleWalls(0, 0, 800, 400));
    floor.walls.push(inner({ x: 550, y: 0 }, { x: 550, y: 400 }));
    floor.walls.push(inner({ x: 550, y: 220 }, { x: 800, y: 220 }));
    nameRooms(floor, [
      { at: { x: 250, y: 200 }, name: 'Кухня-гостиная', type: 'living' },
      { at: { x: 650, y: 100 }, name: 'Санузел', type: 'bathroom' },
      { at: { x: 650, y: 300 }, name: 'Прихожая', type: 'hallway' },
    ]);
    const [top, , bottom, left] = floor.walls;
    floor.openings.push(createWindow(top, 250, { width: 180 }));
    floor.openings.push(createDoor(bottom, 700, { type: 'entrance', width: 90, height: 205, color: '#4a3b30', swing: 'in' }));
    floor.openings.push(createDoor(floor.walls[5], 100, { width: 70 }));
    floor.openings.push(createDoor(floor.walls[4], 320, { width: 80, hinge: 'right' }));
    floor.openings.push(createWindow(left, 200, { width: 100 }));
    place(floor, 'sofa-v1', 250, 330, 180);
    place(floor, 'coffee-table', 250, 250);
    place(floor, 'kitchen-base-v2', 70, 50, 0);
    place(floor, 'fridge', 145, 43, 0);
    place(floor, 'stove', 55 + 150, 40, 0);
    place(floor, 'round-table', 420, 120);
    place(floor, 'toilet', 740, 45, 0);
    place(floor, 'shower', 605, 60, 0);
    place(floor, 'washbasin', 690, 35, 0);
    place(floor, 'rug', 250, 280);
  } else if (templateId === 'one-room') {
    floor.walls.push(...rectangleWalls(0, 0, 900, 480));
    floor.walls.push(inner({ x: 500, y: 0 }, { x: 500, y: 480 }));
    floor.walls.push(inner({ x: 500, y: 300 }, { x: 900, y: 300 }));
    floor.walls.push(inner({ x: 700, y: 300 }, { x: 700, y: 480 }));
    nameRooms(floor, [
      { at: { x: 250, y: 240 }, name: 'Комната', type: 'bedroom' },
      { at: { x: 700, y: 150 }, name: 'Кухня', type: 'kitchen' },
      { at: { x: 600, y: 400 }, name: 'Коридор', type: 'hallway' },
      { at: { x: 800, y: 400 }, name: 'Санузел', type: 'bathroom' },
    ]);
    const [top, , bottom] = floor.walls;
    floor.openings.push(createWindow(top, 250, { width: 150 }));
    floor.openings.push(createWindow(top, 700, { width: 120 }));
    floor.openings.push(createDoor(bottom, 600, { type: 'entrance', width: 90, height: 205, color: '#4a3b30' }));
    floor.openings.push(createDoor(floor.walls[4], 390, { hinge: 'right' }));
    floor.openings.push(createDoor(floor.walls[5], 100));
    floor.openings.push(createDoor(floor.walls[6], 90, { width: 70 }));
    place(floor, 'bed-double', 250, 370, 180);
    place(floor, 'nightstand', 140, 450, 180);
    place(floor, 'nightstand', 360, 450, 180);
    place(floor, 'wardrobe', 110, 42, 0);
    place(floor, 'desk', 380, 47, 0);
    place(floor, 'kitchen-base-v2', 575, 42, 0);
    place(floor, 'stove', 665, 42, 0);
    place(floor, 'fridge', 865, 45, 0);
    place(floor, 'dining-table-v1', 720, 200);
    place(floor, 'bathtub', 800, 435, 180);
    place(floor, 'toilet', 865, 350, 270);
  } else if (templateId === 'two-room') {
    floor.walls.push(...rectangleWalls(0, 0, 1100, 620));
    floor.walls.push(inner({ x: 600, y: 0 }, { x: 600, y: 620 }));
    floor.walls.push(inner({ x: 600, y: 360 }, { x: 1100, y: 360 }));
    floor.walls.push(inner({ x: 0, y: 400 }, { x: 600, y: 400 }));
    floor.walls.push(inner({ x: 850, y: 360 }, { x: 850, y: 620 }));
    nameRooms(floor, [
      { at: { x: 300, y: 200 }, name: 'Гостиная', type: 'living' },
      { at: { x: 850, y: 180 }, name: 'Спальня', type: 'bedroom' },
      { at: { x: 300, y: 510 }, name: 'Кухня', type: 'kitchen' },
      { at: { x: 725, y: 490 }, name: 'Коридор', type: 'hallway' },
      { at: { x: 975, y: 490 }, name: 'Санузел', type: 'bathroom' },
    ]);
    const [top, right, bottom] = floor.walls;
    floor.openings.push(createWindow(top, 300, { type: 'double', width: 180 }));
    floor.openings.push(createWindow(top, 850, { width: 150 }));
    floor.openings.push(createWindow(bottom, 800, { width: 120 }));
    floor.openings.push(createWindow(right, 180, { width: 120 }));
    floor.openings.push(createDoor(bottom, 380, { type: 'entrance', width: 90, height: 205, color: '#4a3b30' }));
    floor.openings.push(createDoor(floor.walls[4], 500, { width: 90 }));
    floor.openings.push(createDoor(floor.walls[5], 120));
    floor.openings.push(createDoor(floor.walls[7], 130, { width: 70 }));
    floor.openings.push(createDoor(floor.walls[6], 520, { type: 'double', width: 140 }));
    place(floor, 'corner-sofa', 170, 290, 180);
    place(floor, 'coffee-table', 250, 220);
    place(floor, 'tv-stand', 300, 32, 0);
    place(floor, 'tv', 300, 20, 0);
    place(floor, 'rug', 250, 230);
    place(floor, 'plant-pot', 555, 45);
    place(floor, 'armchair-sheen', 470, 230, 90);
    place(floor, 'floor-lamp-arc', 60, 70);
    place(floor, 'vase-flowers', 250, 220);
    place(floor, 'bed-double-v1', 850, 240, 180);
    place(floor, 'nightstand', 730, 330, 180);
    place(floor, 'nightstand', 970, 330, 180);
    place(floor, 'wardrobe', 740, 42, 0);
    place(floor, 'kitchen-base-v2', 100, 580, 180);
    place(floor, 'sink-cabinet', 200, 580, 180);
    place(floor, 'stove', 270, 580, 180);
    place(floor, 'fridge', 560, 575, 180);
    place(floor, 'dining-table-v1', 380, 480);
    place(floor, 'bathtub', 975, 585, 180);
    place(floor, 'washbasin', 1070, 440, 270);
    place(floor, 'ceiling-light', 300, 200);
  } else if (templateId === 'bedroom') {
    floor.walls.push(...rectangleWalls(0, 0, 440, 380));
    nameRooms(floor, [{ at: { x: 220, y: 190 }, name: 'Спальня', type: 'bedroom' }]);
    const [top, , bottom] = floor.walls;
    floor.openings.push(createWindow(top, 220, { width: 150 }));
    floor.openings.push(createDoor(bottom, 360));
    place(floor, 'bed-double', 190, 120, 0);
    place(floor, 'nightstand', 80, 40, 0);
    place(floor, 'nightstand', 300, 40, 0);
    place(floor, 'wardrobe-v1', 60, 330, 180);
    place(floor, 'dresser', 400, 190, 270);
    place(floor, 'rug', 190, 250);
  }
  return project;
}

export function projectFloorsCount(project: ProjectData): number {
  return project.floors.length;
}
