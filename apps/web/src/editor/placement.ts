import { CATALOG_BY_ID, createObject, snapObjectToWall, type Vec2 } from '@spaceplan/shared';
import { useEditor } from './store';
import { AddObjectCommand } from './commands';

/** Add a catalog item to the active floor at a plan point, snapping it to a nearby wall */
export function placeCatalogItem(itemId: string, at: Vec2) {
  const item = CATALOG_BY_ID[itemId];
  if (!item) return;
  const s = useEditor.getState();
  const floor = s.project.floors.find((f) => f.id === s.floorId);
  if (!floor) return;
  const obj = createObject(itemId, at);
  const snap = s.snapToWalls || item.wallMounted ? snapObjectToWall(obj, floor.walls, item.wallMounted ? 200 : 40) : null;
  if (snap) {
    obj.position = { ...obj.position, ...snap.position };
    obj.rotation = snap.rotation;
  }
  s.execute(AddObjectCommand(floor.id, obj));
  s.select({ kind: 'object', id: obj.id });
  s.setTool('select');
}
