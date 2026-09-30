import { describe, expect, it } from 'vitest';
import {
  calculateBudget,
  createProjectFromTemplate,
  createWall,
  detectRooms,
  projectDataSchema,
  rectangleWalls,
  roomArea,
  roomDimensions,
  snapObjectToWall,
  TEMPLATES,
} from '../src';

describe('room detection', () => {
  it('detects a single rectangular room and computes inner area', () => {
    const walls = rectangleWalls(0, 0, 440, 380, { thickness: 20 });
    const rooms = detectRooms(walls);
    expect(rooms).toHaveLength(1);
    // inner: (440-20) x (380-20) = 420 x 360 → 15.12 m²
    expect(roomArea(rooms[0], walls) / 10000).toBeCloseTo(15.12, 2);
    const d = roomDimensions(rooms[0], walls);
    expect(d.width).toBeCloseTo(420);
    expect(d.length).toBeCloseTo(360);
  });

  it('splits a rectangle into two rooms with an inner wall (T-junctions)', () => {
    const walls = [...rectangleWalls(0, 0, 800, 400), createWall({ x: 500, y: 0 }, { x: 500, y: 400 })];
    expect(detectRooms(walls)).toHaveLength(2);
  });

  it('handles crossing walls and ignores dangling walls', () => {
    const walls = [
      ...rectangleWalls(0, 0, 600, 600),
      createWall({ x: 300, y: -100 }, { x: 300, y: 700 }),
      createWall({ x: -50, y: 300 }, { x: 650, y: 300 }),
      createWall({ x: 100, y: 100 }, { x: 200, y: 150 }), // dangling
    ];
    expect(detectRooms(walls)).toHaveLength(4);
  });

  it('does not create rooms from an open chain of walls', () => {
    const walls = [createWall({ x: 0, y: 0 }, { x: 400, y: 0 }), createWall({ x: 400, y: 0 }, { x: 400, y: 300 })];
    expect(detectRooms(walls)).toHaveLength(0);
  });

  it('preserves room metadata when walls move', () => {
    const walls = rectangleWalls(0, 0, 400, 400);
    const [room] = detectRooms(walls);
    room.name = 'Спальня';
    room.type = 'bedroom';
    walls[1].start.x = 500;
    walls[1].end.x = 500;
    walls[0].end.x = 500;
    walls[2].start.x = 500;
    const next = detectRooms(walls, [room]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(room.id);
    expect(next[0].name).toBe('Спальня');
  });
});

describe('templates', () => {
  it.each(TEMPLATES.map((t) => t.id))('template %s is valid project JSON', (id) => {
    const p = createProjectFromTemplate(id);
    expect(projectDataSchema.safeParse(p).success).toBe(true);
  });

  it('two-room template has 5 named rooms and a budget in KZT', () => {
    const p = createProjectFromTemplate('two-room');
    const rooms = p.floors[0].rooms;
    expect(rooms).toHaveLength(5);
    expect(rooms.map((r) => r.name).sort()).toEqual(['Гостиная', 'Коридор', 'Кухня', 'Санузел', 'Спальня']);
    const budget = calculateBudget(p);
    expect(budget.total).toBeGreaterThan(0);
    expect(budget.byCategory.map((c) => c.category)).toContain('Мебель');
  });
});

describe('snap to wall', () => {
  it('pushes the object back flush against the wall and faces it into the room', () => {
    const walls = rectangleWalls(0, 0, 400, 400, { thickness: 20 });
    const res = snapObjectToWall({ position: { x: 200, y: 70 }, width: 100, depth: 60, rotation: 45 }, walls);
    expect(res).not.toBeNull();
    expect(res!.position.y).toBeCloseTo(10 + 30);
    expect(res!.rotation).toBeCloseTo(0);
  });
});
