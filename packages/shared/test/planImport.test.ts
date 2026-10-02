import { describe, expect, it } from 'vitest';
import { applyRoomLabels, buildPlanGeometry, roomTypeFromName, syncRooms, createFloor, type RecognizedPlan } from '../src';

/** 600 × 400 px apartment drawn with 10 px walls: two rooms, a door gap in the partition */
const plan: RecognizedPlan = {
  source: 'local',
  imageWidth: 800,
  imageHeight: 600,
  cmPerPixel: null,
  walls: [
    // outer contour, with ends overshooting into the corners like pixel runs do
    { x1: 95, y1: 100, x2: 705, y2: 100, thickness: 10 },
    { x1: 95, y1: 500, x2: 705, y2: 500, thickness: 10 },
    { x1: 100, y1: 95, x2: 100, y2: 505, thickness: 10 },
    { x1: 700, y1: 95, x2: 700, y2: 505, thickness: 10 },
    // partition split by a 90 px door gap (y 250..340)
    { x1: 400, y1: 105, x2: 400, y2: 250, thickness: 8 },
    { x1: 401, y1: 340, x2: 401, y2: 495, thickness: 8 },
  ],
  openings: [{ kind: 'window', x: 250, y: 100, width: 120 }],
  rooms: [
    { name: 'кухня', x: 250, y: 300 },
    { name: 'Спальня', x: 550, y: 300 },
  ],
};

describe('plan import', () => {
  it('builds clean joined walls, bridges door gaps and attaches openings', () => {
    const g = buildPlanGeometry(plan, 2); // 2 cm per px → 12 × 8 m
    expect(g.walls).toHaveLength(5);
    // corners snapped exactly
    const pts = g.walls.flatMap((w) => [w.start, w.end]).map((p) => `${p.x},${p.y}`);
    for (const c of ['200,200', '1400,200', '200,1000', '1400,1000']) expect(pts).toContain(c);
    // partition joined into one wall, T-joined to top and bottom walls
    expect(pts).toContain('800,200');
    expect(pts).toContain('800,1000');
    const kinds = g.openings.map((o) => o.kind).sort();
    expect(kinds).toEqual(['door', 'window']);
    const door = g.openings.find((o) => o.kind === 'door')!;
    expect(door.width).toBe(160);

    const floor = { ...createFloor(1), walls: g.walls, openings: g.openings };
    syncRooms(floor);
    expect(floor.rooms).toHaveLength(2);
    applyRoomLabels(floor, g.roomLabels);
    expect(floor.rooms.map((r) => r.name).sort()).toEqual(['Кухня', 'Спальня']);
    expect(floor.rooms.find((r) => r.name === 'Кухня')!.type).toBe('kitchen');
  });

  it('maps room names to types', () => {
    expect(roomTypeFromName('Санузел')).toBe('toilet');
    expect(roomTypeFromName('Ванная')).toBe('bathroom');
    expect(roomTypeFromName('Прихожая')).toBe('hallway');
    expect(roomTypeFromName('Гостиная')).toBe('living');
  });
});
