import { DoorOpen, Hand, MousePointer2, PenLine, Square, AppWindow } from 'lucide-react';
import { DOOR_PRESETS, WINDOW_PRESETS } from '@spaceplan/shared';
import { useEditor, type Tool } from '../store';

const TOOLS: { id: Tool; label: string; icon: typeof Hand; key: string }[] = [
  { id: 'select', label: 'Выделение', icon: MousePointer2, key: 'V' },
  { id: 'wall', label: 'Стены', icon: PenLine, key: 'W' },
  { id: 'room', label: 'Комната', icon: Square, key: 'Q' },
  { id: 'door', label: 'Дверь', icon: DoorOpen, key: 'D' },
  { id: 'window', label: 'Окно', icon: AppWindow, key: 'O' },
  { id: 'pan', label: 'Панорама', icon: Hand, key: 'H' },
];

export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

export function ToolsPanel() {
  const tool = useEditor((s) => s.tool);
  const view = useEditor((s) => s.view);
  const doorType = useEditor((s) => s.doorType);
  const windowType = useEditor((s) => s.windowType);
  const set = useEditor((s) => s.set);
  const setTool = useEditor((s) => s.setTool);
  const disabled = view === '3d';

  return (
    <div className="border-b border-gray-200 p-3">
      <div className="grid grid-cols-3 gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            disabled={disabled && t.id !== 'select'}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition disabled:opacity-40 ${
              tool === t.id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>
      {tool === 'door' && (
        <select className="input-sm mt-2" value={doorType} onChange={(e) => set({ doorType: e.target.value as typeof doorType })}>
          {Object.entries(DOOR_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name} · {p.width} см
            </option>
          ))}
        </select>
      )}
      {tool === 'window' && (
        <select className="input-sm mt-2" value={windowType} onChange={(e) => set({ windowType: e.target.value as typeof windowType })}>
          {Object.entries(WINDOW_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name} · {p.width} см
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
