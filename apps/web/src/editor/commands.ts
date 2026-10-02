import {
  applyRoomLabels,
  cleanupOpenings,
  clampOpeningOffset,
  createWall,
  samePoint,
  syncRooms,
  wallDirection,
  wallLength,
  add,
  scale,
  type Floor,
  type Opening,
  type PlacedObject,
  type PlanGeometry,
  type ProjectData,
  type Room,
  type Vec2,
  type Wall,
} from '@spaceplan/shared';

/**
 * Editor commands (docs, section 40). A command is a named, pure "recipe" mutating an
 * immer draft of the project; the store turns it into forward/inverse patches, which are
 * what the undo/redo history stores. Every recipe must be deterministic with respect to
 * its arguments so that drag previews can be re-applied from the same base state.
 */
export interface Command {
  label: string;
  apply: (draft: ProjectData) => void;
}

const floorOf = (p: ProjectData, floorId: string): Floor => {
  const f = p.floors.find((x) => x.id === floorId);
  if (!f) throw new Error(`Floor ${floorId} not found`);
  return f;
};

/** After any wall geometry change: recompute rooms and drop/clamp orphaned openings */
function afterWallsChanged(floor: Floor) {
  syncRooms(floor);
  cleanupOpenings(floor);
  const walls = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings) o.offset = clampOpeningOffset(walls.get(o.wallId)!, o);
}

/** Move every wall endpoint located at `from` to `to` (keeps corners connected) */
function moveJoint(floor: Floor, from: Vec2, to: Vec2, exclude?: Set<string>) {
  for (const w of floor.walls) {
    if (exclude?.has(w.id)) continue;
    if (samePoint(w.start, from)) w.start = { ...to };
    if (samePoint(w.end, from)) w.end = { ...to };
  }
}

export const AddWallsCommand = (floorId: string, walls: Wall[]): Command => ({
  label: walls.length > 1 ? 'Добавить стены' : 'Добавить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    f.walls.push(...walls.map((w) => ({ ...w, start: { ...w.start }, end: { ...w.end } })));
    afterWallsChanged(f);
  },
});

export const DeleteWallCommand = (floorId: string, wallId: string): Command => ({
  label: 'Удалить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    f.walls = f.walls.filter((w) => w.id !== wallId);
    afterWallsChanged(f);
  },
});

/** Translate a wall perpendicular to itself; connected walls stretch to follow */
export const MoveWallCommand = (floorId: string, wallId: string, base: Wall, delta: Vec2): Command => ({
  label: 'Переместить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const w = f.walls.find((x) => x.id === wallId);
    if (!w) return;
    const newStart = add(base.start, delta);
    const newEnd = add(base.end, delta);
    moveJoint(f, base.start, newStart);
    moveJoint(f, base.end, newEnd);
    w.start = newStart;
    w.end = newEnd;
    afterWallsChanged(f);
  },
});

export const MoveWallEndpointCommand = (floorId: string, from: Vec2, to: Vec2): Command => ({
  label: 'Изменить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    moveJoint(f, from, to);
    afterWallsChanged(f);
  },
});

/** Change wall length by moving its end point along the wall direction */
export const SetWallLengthCommand = (floorId: string, wallId: string, length: number): Command => ({
  label: 'Изменить длину стены',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const w = f.walls.find((x) => x.id === wallId);
    if (!w || length <= 1) return;
    const to = add(w.start, scale(wallDirection(w), length));
    moveJoint(f, w.end, to);
    afterWallsChanged(f);
  },
});

export const UpdateWallCommand = (floorId: string, wallId: string, patch: Partial<Pick<Wall, 'height' | 'thickness' | 'materialId'>>): Command => ({
  label: 'Изменить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const w = f.walls.find((x) => x.id === wallId);
    if (!w) return;
    Object.assign(w, patch);
    if (patch.thickness !== undefined) afterWallsChanged(f);
  },
});

/** Split a wall at a point (to create T-junctions manually) */
export const SplitWallCommand = (floorId: string, wallId: string, at: Vec2): Command => ({
  label: 'Разделить стену',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const idx = f.walls.findIndex((x) => x.id === wallId);
    if (idx < 0) return;
    const w = f.walls[idx];
    const second = createWall(at, w.end, { height: w.height, thickness: w.thickness, materialId: w.materialId });
    const firstLen = Math.hypot(at.x - w.start.x, at.y - w.start.y);
    for (const o of f.openings) {
      if (o.wallId === w.id && o.offset > firstLen) {
        o.wallId = second.id;
        o.offset -= firstLen;
      }
    }
    w.end = { ...at };
    f.walls.splice(idx + 1, 0, second);
    afterWallsChanged(f);
  },
});

export const AddOpeningCommand = (floorId: string, opening: Opening): Command => ({
  label: opening.kind === 'door' ? 'Добавить дверь' : 'Добавить окно',
  apply: (p) => {
    floorOf(p, floorId).openings.push({ ...opening });
  },
});

export const UpdateOpeningCommand = (floorId: string, id: string, patch: Partial<Opening>): Command => ({
  label: 'Изменить проём',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const o = f.openings.find((x) => x.id === id);
    if (!o) return;
    Object.assign(o, patch);
    const w = f.walls.find((x) => x.id === o.wallId);
    if (w) {
      o.width = Math.min(o.width, wallLength(w));
      o.offset = clampOpeningOffset(w, o);
      o.height = Math.min(o.height, w.height - o.elevation);
    }
  },
});

export const DeleteOpeningCommand = (floorId: string, id: string): Command => ({
  label: 'Удалить проём',
  apply: (p) => {
    const f = floorOf(p, floorId);
    f.openings = f.openings.filter((o) => o.id !== id);
  },
});

export const UpdateRoomCommand = (floorId: string, id: string, patch: Partial<Omit<Room, 'id' | 'polygon'>>): Command => ({
  label: 'Изменить комнату',
  apply: (p) => {
    const r = floorOf(p, floorId).rooms.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  },
});

/** "Delete room" removes all walls that bound only this room */
export const DeleteRoomCommand = (floorId: string, roomId: string): Command => ({
  label: 'Удалить комнату',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const room = f.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const others = f.rooms.filter((r) => r.id !== roomId);
    const onEdge = (poly: Vec2[], w: Wall) => {
      const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
      return poly.some((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const cross = (b.x - a.x) * (mid.y - a.y) - (b.y - a.y) * (mid.x - a.x);
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        const t = ((mid.x - a.x) * (b.x - a.x) + (mid.y - a.y) * (b.y - a.y)) / (l * l);
        return Math.abs(cross / l) < 1 && t > 0 && t < 1;
      });
    };
    f.walls = f.walls.filter((w) => !onEdge(room.polygon, w) || others.some((r) => onEdge(r.polygon, w)));
    afterWallsChanged(f);
  },
});

/** Puts a recognised floor plan on the floor (replacing it, or next to the existing plan) */
export const ImportPlanCommand = (floorId: string, geometry: PlanGeometry, replace: boolean): Command => ({
  label: 'Импорт плана',
  apply: (p) => {
    const f = floorOf(p, floorId);
    const g = structuredClone(geometry);
    if (replace) {
      f.walls = [];
      f.openings = [];
      f.rooms = [];
      f.objects = [];
    } else if (f.walls.length) {
      // Place the imported plan to the right of what is already drawn
      const maxX = Math.max(...f.walls.flatMap((w) => [w.start.x, w.end.x]));
      const minX = Math.min(...g.walls.flatMap((w) => [w.start.x, w.end.x]));
      const dx = maxX + 200 - minX;
      for (const w of g.walls) {
        w.start.x += dx;
        w.end.x += dx;
      }
      for (const l of g.roomLabels) l.point.x += dx;
    }
    f.walls.push(...g.walls);
    f.openings.push(...g.openings);
    afterWallsChanged(f);
    applyRoomLabels(f, g.roomLabels);
  },
});

export const AddObjectCommand = (floorId: string, obj: PlacedObject): Command => ({
  label: 'Добавить объект',
  apply: (p) => {
    floorOf(p, floorId).objects.push(structuredClone(obj));
  },
});

export const UpdateObjectCommand = (
  floorId: string,
  id: string,
  patch: Partial<Omit<PlacedObject, 'id' | 'catalogItemId'>>,
  label = 'Изменить объект',
): Command => ({
  label,
  apply: (p) => {
    const o = floorOf(p, floorId).objects.find((x) => x.id === id);
    if (!o) return;
    const { position, ...rest } = patch;
    Object.assign(o, rest);
    if (position) o.position = { ...o.position, ...position };
  },
});

export const MoveObjectCommand = (floorId: string, id: string, x: number, y: number, rotation?: number) =>
  UpdateObjectCommand(floorId, id, { position: { x, y } as PlacedObject['position'], ...(rotation !== undefined ? { rotation } : {}) }, 'Переместить объект');

export const DeleteObjectCommand = (floorId: string, id: string): Command => ({
  label: 'Удалить объект',
  apply: (p) => {
    const f = floorOf(p, floorId);
    f.objects = f.objects.filter((o) => o.id !== id);
  },
});

export const DuplicateObjectCommand = (floorId: string, source: PlacedObject, newId: string): Command => ({
  label: 'Копировать объект',
  apply: (p) => {
    const copy = structuredClone(source);
    copy.id = newId;
    copy.position = { ...source.position, x: source.position.x + 30, y: source.position.y + 30 };
    floorOf(p, floorId).objects.push(copy);
  },
});

export const UpdateProjectCommand = (patch: Partial<Pick<ProjectData, 'units'>> & { settings?: Partial<ProjectData['settings']> }, label = 'Настройки проекта'): Command => ({
  label,
  apply: (p) => {
    if (patch.units) p.units = patch.units;
    if (patch.settings) Object.assign(p.settings, patch.settings);
  },
});

export const AddFloorCommand = (floor: Floor): Command => ({
  label: 'Добавить этаж',
  apply: (p) => {
    p.floors.push(structuredClone(floor));
  },
});

export const UpdateFloorCommand = (floorId: string, patch: Partial<Pick<Floor, 'name' | 'height'>>): Command => ({
  label: 'Изменить этаж',
  apply: (p) => {
    const f = floorOf(p, floorId);
    if (patch.height !== undefined && patch.height !== f.height) {
      // Walls that used the floor default height follow it
      for (const w of f.walls) if (w.height === f.height) w.height = patch.height;
    }
    Object.assign(f, patch);
  },
});

export const DeleteFloorCommand = (floorId: string): Command => ({
  label: 'Удалить этаж',
  apply: (p) => {
    if (p.floors.length <= 1) return;
    p.floors = p.floors.filter((f) => f.id !== floorId);
    p.floors.forEach((f, i) => (f.number = i + 1));
  },
});
