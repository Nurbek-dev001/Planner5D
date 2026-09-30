import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Box,
  Calculator,
  Check,
  ChevronDown,
  CloudOff,
  Download,
  Footprints,
  Loader2,
  Magnet,
  Maximize,
  Moon,
  Redo2,
  Ruler,
  Save,
  Sun,
  Undo2,
  AlertTriangle,
} from 'lucide-react';
import { normalizeAngle, uid } from '@spaceplan/shared';
import { useEditor, findSelected } from './store';
import Canvas2D from './Canvas2D';
import { ToolsPanel, TOOL_KEYS } from './panels/ToolsPanel';
import { CatalogPanel } from './panels/CatalogPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { FloorsBar } from './panels/FloorsBar';
import { BudgetDialog } from './panels/BudgetDialog';
import { exportImage, exportJson, exportPdf } from './export';
import {
  DeleteObjectCommand,
  DeleteOpeningCommand,
  DeleteRoomCommand,
  DeleteWallCommand,
  DuplicateObjectCommand,
  UpdateObjectCommand,
  UpdateProjectCommand,
} from './commands';
import { walkInput } from './three/walkInput';

const Scene3D = lazy(() => import('./three/Scene3D'));

export type SaveState = 'saved' | 'saving' | 'dirty' | 'offline' | 'error' | 'conflict' | 'local';

interface EditorProps {
  name: string;
  onRename?: (name: string) => void;
  saveState: SaveState;
  onSave?: () => void;
  headerExtra?: ReactNode;
  backTo: string;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
}

function deleteSelection() {
  const s = useEditor.getState();
  const sel = s.selection;
  if (!sel) return;
  const map = { wall: DeleteWallCommand, opening: DeleteOpeningCommand, room: DeleteRoomCommand, object: DeleteObjectCommand };
  s.execute(map[sel.kind](s.floorId, sel.id));
  s.select(null);
}

export function Editor({ name, onRename, saveState, onSave, headerExtra, backTo }: EditorProps) {
  const view = useEditor((s) => s.view);
  const walkMode = useEditor((s) => s.walkMode);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undoLabel = useEditor((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useEditor((s) => s.future[s.future.length - 1]?.label);
  const snapToWalls = useEditor((s) => s.snapToWalls);
  const showDimensions = useEditor((s) => s.showDimensions);
  const night = useEditor((s) => s.project.settings.timeOfDay === 'night');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'catalog' | 'help'>('catalog');
  const { undo, redo, setView, set, execute } = useEditor.getState();

  // Keyboard shortcuts (docs, section 40)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = useEditor.getState();
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        onSave?.();
      } else if (mod && key === 'd') {
        e.preventDefault();
        const floor = s.project.floors.find((f) => f.id === s.floorId)!;
        const sel = s.selection;
        if (sel?.kind === 'object') {
          const obj = findSelected(floor, sel);
          if (obj) {
            const id = uid('obj');
            s.execute(DuplicateObjectCommand(s.floorId, obj as never, id));
            s.select({ kind: 'object', id });
          }
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        if (s.walkMode) s.set({ walkMode: false });
        else if (s.tool !== 'wall') {
          s.select(null);
          s.setTool('select');
        }
      } else if (!mod && key === 'r' && s.selection?.kind === 'object' && !s.walkMode) {
        const floor = s.project.floors.find((f) => f.id === s.floorId)!;
        const obj = floor.objects.find((o) => o.id === s.selection!.id);
        if (obj) s.execute(UpdateObjectCommand(s.floorId, obj.id, { rotation: normalizeAngle(obj.rotation + (e.shiftKey ? 15 : 90)) }, 'Повернуть объект'));
      } else if (!mod && s.view === '2d' && TOOL_KEYS[key]) {
        s.setTool(TOOL_KEYS[key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);

  return (
    <div className="flex h-full flex-col">
      {/* Header (docs, section 6) */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3">
        <Link to={backTo} className="flex items-center gap-2 pr-2 font-bold text-brand-600">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
          <span className="hidden sm:inline">SpacePlan</span>
        </Link>
        <ProjectName name={name} onRename={onRename} />
        <SaveIndicator state={saveState} />
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <button className="btn-ghost px-2" disabled={!canUndo} onClick={undo} title={`Отменить${undoLabel ? `: ${undoLabel}` : ''} (Ctrl+Z)`}>
          <Undo2 size={18} />
        </button>
        <button className="btn-ghost px-2" disabled={!canRedo} onClick={redo} title={`Повторить${redoLabel ? `: ${redoLabel}` : ''} (Ctrl+Shift+Z)`}>
          <Redo2 size={18} />
        </button>
        <div className="flex-1" />
        {headerExtra}
        <button className="btn-ghost" onClick={() => setBudgetOpen(true)} title="Смета">
          <Calculator size={17} />
          <span className="hidden md:inline">Смета</span>
        </button>
        {/* Downloads are unavailable in the embedded static demo */}
        {import.meta.env.VITE_STATIC_DEMO !== '1' && <ExportMenu name={name} />}
        {onSave && (
          <button className="btn-primary" onClick={onSave} title="Сохранить (Ctrl+S)">
            <Save size={16} />
            <span className="hidden md:inline">Сохранить</span>
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: tools + catalog */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
          <ToolsPanel />
          <div className="flex border-b border-gray-200 text-xs font-medium">
            <button className={`flex-1 py-2 ${leftTab === 'catalog' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`} onClick={() => setLeftTab('catalog')}>
              Каталог
            </button>
            <button className={`flex-1 py-2 ${leftTab === 'help' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`} onClick={() => setLeftTab('help')}>
              Подсказки
            </button>
          </div>
          {leftTab === 'catalog' ? <CatalogPanel /> : <Help />}
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          {view === '2d' ? (
            <Canvas2D />
          ) : (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-gray-400">Загрузка 3D…</div>}>
              <Scene3D />
            </Suspense>
          )}

          <div className="absolute top-3 left-3">
            <FloorsBar />
          </div>

          <div className="absolute top-3 right-3 flex gap-1 rounded-lg bg-white/95 p-1 shadow-sm ring-1 ring-gray-200">
            {view === '2d' ? (
              <>
                <ToggleIcon active={snapToWalls} title="Привязка мебели к стенам" onClick={() => set({ snapToWalls: !snapToWalls })} icon={<Magnet size={16} />} />
                <ToggleIcon active={showDimensions} title="Размеры стен" onClick={() => set({ showDimensions: !showDimensions })} icon={<Ruler size={16} />} />
                <ToggleIcon active={false} title="Показать весь план" onClick={() => window.dispatchEvent(new Event('spaceplan:fit'))} icon={<Maximize size={16} />} />
              </>
            ) : (
              <>
                <ToggleIcon active={walkMode} title="Прогулка от первого лица (WASD + мышь)" onClick={() => set({ walkMode: !walkMode })} icon={<Footprints size={16} />} />
                <ToggleIcon
                  active={night}
                  title={night ? 'Ночь' : 'День'}
                  onClick={() => execute(UpdateProjectCommand({ settings: { timeOfDay: night ? 'day' : 'night' } }, 'День / ночь'))}
                  icon={night ? <Moon size={16} /> : <Sun size={16} />}
                />
              </>
            )}
          </div>

          {/* 2D | 3D switch (same Project JSON for both renderers) */}
          <div className="absolute top-3 left-1/2 flex -translate-x-1/2 rounded-full bg-white p-1 shadow-md ring-1 ring-gray-200">
            {(['2d', '3d'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-semibold ${view === v ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {v === '3d' && <Box size={15} />}
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          {view === '3d' && walkMode && <Joystick />}
          {view === '3d' && walkMode && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs text-white">
              WASD — движение · мышь (зажать) — обзор · Shift — быстрее · Esc — выход
            </div>
          )}
        </main>

        {/* Right: properties */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white lg:block">
          <PropertiesPanel />
        </aside>
      </div>

      {budgetOpen && <BudgetDialog onClose={() => setBudgetOpen(false)} />}
    </div>
  );
}

function ToggleIcon({ active, title, onClick, icon }: { active: boolean; title: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className={`rounded-md p-1.5 ${active ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-gray-100'}`}>
      {icon}
    </button>
  );
}

function ProjectName({ name, onRename }: { name: string; onRename?: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  if (!onRename || !editing)
    return (
      <button className="max-w-[16rem] truncate rounded px-2 py-1 font-medium text-gray-800 hover:bg-gray-100" onClick={() => onRename && setEditing(true)} title={onRename ? 'Переименовать' : undefined}>
        {name}
      </button>
    );
  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name) onRename(value.trim());
    else setValue(name);
  };
  return (
    <input
      autoFocus
      className="input-sm w-56"
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; icon: ReactNode; cls: string }> = {
    saved: { text: 'Сохранено', icon: <Check size={14} />, cls: 'text-emerald-600' },
    saving: { text: 'Сохранение…', icon: <Loader2 size={14} className="animate-spin" />, cls: 'text-gray-500' },
    dirty: { text: 'Есть изменения', icon: null, cls: 'text-gray-500' },
    offline: { text: 'Нет сети — сохранено локально', icon: <CloudOff size={14} />, cls: 'text-amber-600' },
    error: { text: 'Ошибка сохранения', icon: <AlertTriangle size={14} />, cls: 'text-red-600' },
    conflict: { text: 'Проект изменён в другом окне', icon: <AlertTriangle size={14} />, cls: 'text-red-600' },
    local: { text: 'Демо: сохраняется в браузере', icon: null, cls: 'text-gray-500' },
  };
  const m = map[state];
  return <span className={`hidden items-center gap-1 text-xs sm:flex ${m.cls}`}>{m.icon}{m.text}</span>;
}

function ExportMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  const item = (label: string, fn: () => void) => (
    <button
      className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost" onClick={() => setOpen(!open)}>
        <Download size={17} />
        <span className="hidden md:inline">Экспорт</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-gray-200">
          {item('Изображение PNG', () => exportImage(name, 'png'))}
          {item('Изображение JPG', () => exportImage(name, 'jpg'))}
          {item('PDF (план + смета)', () => exportPdf(name))}
          <div className="my-1 border-t border-gray-100" />
          {item('Проект JSON', () => exportJson(name, useEditor.getState().project))}
        </div>
      )}
    </div>
  );
}

function Help() {
  return (
    <div className="space-y-3 overflow-y-auto p-4 text-sm text-gray-600">
      <p>
        <b>Стены (W):</b> кликайте по точкам, двойной клик или Esc — завершить. Клик в начальную точку замыкает контур — комната создаётся автоматически.
      </p>
      <p>
        <b>Комната (Q):</b> потяните прямоугольник — будут созданы 4 стены.
      </p>
      <p>
        <b>Двери (D) и окна (O):</b> кликните по стене. Перетаскивайте вдоль стены.
      </p>
      <p>
        <b>Мебель:</b> перетащите из каталога на план или кликните по карточке. R — повернуть, Ctrl+D — копия, Delete — удалить.
      </p>
      <p>
        <b>Стены:</b> тяните стену, чтобы сдвинуть её, или маркеры на концах. Соседние стены и площади пересчитываются.
      </p>
      <p>
        <b>Навигация:</b> колесо — масштаб, пробел/правая кнопка/пустое место — панорама.
      </p>
      <p>
        <b>Отмена:</b> Ctrl+Z, повтор — Ctrl+Shift+Z.
      </p>
    </div>
  );
}

/** Virtual joystick for walk mode on touch devices (docs, section 15) */
function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number } | null>(null);
  const R = 40;
  const update = (x: number, y: number) => {
    const l = Math.hypot(x, y);
    const k = l > R ? R / l : 1;
    setKnob({ x: x * k, y: y * k });
    walkInput.forward = (-y * k) / R;
    walkInput.turn = (x * k) / R;
  };
  useEffect(
    () => () => {
      walkInput.forward = 0;
      walkInput.turn = 0;
    },
    [],
  );
  return (
    <div
      className="absolute right-6 bottom-20 h-28 w-28 touch-none rounded-full bg-black/20 md:hidden"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        update(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerMove={(e) => origin.current && update(e.clientX - origin.current.x, e.clientY - origin.current.y)}
      onPointerUp={() => {
        origin.current = null;
        update(0, 0);
      }}
    >
      <div className="absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-white/80 shadow" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}
