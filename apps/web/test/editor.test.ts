import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createObject, createProjectFromTemplate, createWall, floorArea, rectangleWalls } from '@spaceplan/shared';
import { useEditor } from '../src/editor/store';
import {
  AddObjectCommand,
  AddWallsCommand,
  DeleteWallCommand,
  MoveObjectCommand,
  MoveWallCommand,
  SetWallLengthCommand,
  UpdateRoomCommand,
} from '../src/editor/commands';

const floor = () => {
  const s = useEditor.getState();
  return s.project.floors.find((f) => f.id === s.floorId)!;
};

describe('editor store (command pattern, undo/redo)', () => {
  beforeEach(() => useEditor.getState().load(createEmptyProject()));

  it('adds walls, detects the room and undoes/redoes', () => {
    const s = useEditor.getState();
    s.execute(AddWallsCommand(s.floorId, rectangleWalls(0, 0, 400, 300)));
    expect(floor().rooms).toHaveLength(1);
    expect(useEditor.getState().past.map((h) => h.label)).toEqual(['Добавить стены']);

    useEditor.getState().undo();
    expect(floor().walls).toHaveLength(0);
    expect(floor().rooms).toHaveLength(0);

    useEditor.getState().redo();
    expect(floor().walls).toHaveLength(4);
    expect(floor().rooms).toHaveLength(1);
  });

  it('moving a wall stretches connected walls and keeps room metadata', () => {
    const s = useEditor.getState();
    const walls = rectangleWalls(0, 0, 400, 300, { thickness: 20 });
    s.execute(AddWallsCommand(s.floorId, walls));
    const roomId = floor().rooms[0].id;
    useEditor.getState().execute(UpdateRoomCommand(s.floorId, roomId, { name: 'Спальня', type: 'bedroom' }));
    const before = floorArea(floor());

    const right = floor().walls[1];
    useEditor.getState().execute(MoveWallCommand(s.floorId, right.id, right, { x: 100, y: 0 }));
    expect(floor().walls[0].end.x).toBe(500);
    expect(floor().walls[2].start.x).toBe(500);
    expect(floor().rooms[0].name).toBe('Спальня');
    expect(floorArea(floor()) - before).toBeCloseTo(100 * 280);
  });

  it('drag preview does not pollute history until committed', () => {
    const s = useEditor.getState();
    const obj = createObject('sofa', { x: 100, y: 100 });
    s.execute(AddObjectCommand(s.floorId, obj));
    s.beginPreview();
    for (let x = 110; x <= 200; x += 10) useEditor.getState().preview(MoveObjectCommand(s.floorId, obj.id, x, 100));
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().endPreview(MoveObjectCommand(s.floorId, obj.id, 200, 100));
    expect(useEditor.getState().past).toHaveLength(2);
    expect(floor().objects[0].position.x).toBe(200);
    useEditor.getState().undo();
    expect(floor().objects[0].position.x).toBe(100);
  });

  it('wall length edit and deletion clean up openings', () => {
    useEditor.getState().load(createProjectFromTemplate('bedroom'));
    const s = useEditor.getState();
    const top = floor().walls[0];
    expect(floor().openings.some((o) => o.wallId === top.id)).toBe(true);
    s.execute(SetWallLengthCommand(s.floorId, top.id, 500));
    expect(floor().walls[1].start.x).toBeCloseTo(500);
    useEditor.getState().execute(DeleteWallCommand(s.floorId, top.id));
    expect(floor().openings.some((o) => o.wallId === top.id)).toBe(false);
    expect(floor().rooms).toHaveLength(0);
  });

  it('a wall ending on another wall (T-junction) splits the room', () => {
    const s = useEditor.getState();
    s.execute(AddWallsCommand(s.floorId, rectangleWalls(0, 0, 600, 400)));
    useEditor.getState().execute(AddWallsCommand(s.floorId, [createWall({ x: 300, y: 0 }, { x: 300, y: 400 })]));
    expect(floor().rooms).toHaveLength(2);
  });
});
