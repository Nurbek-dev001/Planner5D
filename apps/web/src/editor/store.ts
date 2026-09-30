import { create } from 'zustand';
import { applyPatches, enablePatches, produce, produceWithPatches, type Patch } from 'immer';
import type { Floor, ProjectData } from '@spaceplan/shared';
import type { Command } from './commands';

enablePatches();

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'pan';
export type ViewMode = '2d' | '3d';
export type SelectionKind = 'wall' | 'opening' | 'room' | 'object';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

const MAX_HISTORY = 200;

interface EditorState {
  project: ProjectData;
  floorId: string;
  /** Increments on every change of `project` (drives autosave) */
  revision: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: Selection | null;
  tool: Tool;
  view: ViewMode;
  walkMode: boolean;
  snapToWalls: boolean;
  showDimensions: boolean;
  /** Pending door/window/furniture type to place with the current tool */
  doorType: 'single' | 'double' | 'sliding' | 'glass' | 'entrance';
  windowType: 'standard' | 'double' | 'panoramic' | 'corner' | 'balcony';
  /** Base state while a drag preview is in progress */
  previewBase: ProjectData | null;

  load: (project: ProjectData) => void;
  execute: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  beginPreview: () => void;
  preview: (cmd: Command) => void;
  endPreview: (cmd: Command | null) => void;
  select: (s: Selection | null) => void;
  setTool: (t: Tool) => void;
  setView: (v: ViewMode) => void;
  setFloor: (id: string) => void;
  set: (patch: Partial<Pick<EditorState, 'walkMode' | 'snapToWalls' | 'showDimensions' | 'doorType' | 'windowType'>>) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null as unknown as ProjectData,
  floorId: '',
  revision: 0,
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  view: '2d',
  walkMode: false,
  snapToWalls: true,
  showDimensions: true,
  doorType: 'single',
  windowType: 'standard',
  previewBase: null,

  load: (project) =>
    set({
      project: produce(project, () => {}),
      floorId: project.floors[0].id,
      revision: 0,
      past: [],
      future: [],
      selection: null,
      previewBase: null,
    }),

  execute: (cmd) => {
    const { project, past, revision } = get();
    const [next, patches, inverse] = produceWithPatches(project, cmd.apply);
    if (!patches.length) return;
    set({
      project: next,
      past: [...past, { label: cmd.label, patches, inverse }].slice(-MAX_HISTORY),
      future: [],
      revision: revision + 1,
    });
    fixSelection();
  },

  undo: () => {
    const { past, future, project, revision } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set({ project: applyPatches(project, entry.inverse), past: past.slice(0, -1), future: [...future, entry], revision: revision + 1 });
    fixSelection();
  },

  redo: () => {
    const { past, future, project, revision } = get();
    const entry = future[future.length - 1];
    if (!entry) return;
    set({ project: applyPatches(project, entry.patches), past: [...past, entry], future: future.slice(0, -1), revision: revision + 1 });
    fixSelection();
  },

  beginPreview: () => set({ previewBase: get().project }),

  preview: (cmd) => {
    const base = get().previewBase;
    if (!base) return;
    set({ project: produce(base, cmd.apply) });
  },

  endPreview: (cmd) => {
    const base = get().previewBase;
    if (!base) return;
    set({ project: base, previewBase: null });
    if (cmd) get().execute(cmd);
  },

  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool, selection: tool === 'select' ? get().selection : null }),
  setView: (view) => set({ view, walkMode: false }),
  setFloor: (floorId) => set({ floorId, selection: null }),
  set: (patch) => set(patch),
}));

/** Drop the selection / active floor if they no longer exist after a change */
function fixSelection() {
  const { project, selection, floorId } = useEditor.getState();
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor) {
    useEditor.setState({ floorId: project.floors[0].id, selection: null });
    return;
  }
  if (selection && !findSelected(floor, selection)) useEditor.setState({ selection: null });
}

export function findSelected(floor: Floor, s: Selection) {
  switch (s.kind) {
    case 'wall':
      return floor.walls.find((w) => w.id === s.id);
    case 'opening':
      return floor.openings.find((o) => o.id === s.id);
    case 'room':
      return floor.rooms.find((r) => r.id === s.id);
    case 'object':
      return floor.objects.find((o) => o.id === s.id);
  }
}

export function useFloor(): Floor {
  return useEditor((s) => s.project.floors.find((f) => f.id === s.floorId) ?? s.project.floors[0]);
}

export const currentFloorId = () => useEditor.getState().floorId;
