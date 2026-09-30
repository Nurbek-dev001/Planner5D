import { Copy, Plus, X } from 'lucide-react';
import { createFloor, uid } from '@spaceplan/shared';
import { useEditor } from '../store';
import { AddFloorCommand, DeleteFloorCommand } from '../commands';

/** Multi-floor support (docs, section 23) */
export function FloorsBar() {
  const floors = useEditor((s) => s.project.floors);
  const floorId = useEditor((s) => s.floorId);
  const { execute, setFloor } = useEditor.getState();

  const addFloor = () => {
    const last = floors[floors.length - 1];
    const f = createFloor(floors.length + 1, { height: last.height });
    execute(AddFloorCommand(f));
    setFloor(f.id);
  };

  const copyFloor = () => {
    const src = floors.find((f) => f.id === floorId)!;
    const copy = structuredClone(src);
    const ids = new Map<string, string>();
    copy.id = uid('floor');
    copy.number = floors.length + 1;
    copy.name = `Этаж ${copy.number}`;
    for (const w of copy.walls) {
      const id = uid('wall');
      ids.set(w.id, id);
      w.id = id;
    }
    for (const o of copy.openings) {
      o.id = uid(o.kind);
      o.wallId = ids.get(o.wallId) ?? o.wallId;
    }
    for (const r of copy.rooms) r.id = uid('room');
    for (const o of copy.objects) o.id = uid('obj');
    execute(AddFloorCommand(copy));
    setFloor(copy.id);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/95 p-1 shadow-sm ring-1 ring-gray-200">
      {floors.map((f) => (
        <div key={f.id} className="group relative">
          <button
            onClick={() => setFloor(f.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium ${f.id === floorId ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {f.name}
          </button>
          {floors.length > 1 && f.id === floorId && (
            <button
              title="Удалить этаж (Ctrl+Z — вернуть)"
              onClick={() => execute(DeleteFloorCommand(f.id))}
              className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-white p-0.5 text-gray-500 shadow ring-1 ring-gray-200 group-hover:block hover:text-red-600"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
      <button title="Добавить этаж" className="rounded-md p-1 text-gray-500 hover:bg-gray-100" onClick={addFloor}>
        <Plus size={16} />
      </button>
      <button title="Копировать этаж" className="rounded-md p-1 text-gray-500 hover:bg-gray-100" onClick={copyFloor}>
        <Copy size={14} />
      </button>
    </div>
  );
}
