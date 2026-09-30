import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectData } from '@spaceplan/shared';
import { api, ApiError, type Project } from '../api/client';
import { useEditor } from './store';
import { renderThumbnail } from './thumbnail';
import type { SaveState } from './Editor';

const DEBOUNCE_MS = 1500;
const RETRY_MS = 15000;
const backupKey = (id: string) => `spaceplan:backup:${id}`;

interface Backup {
  baseVersion: number;
  data: ProjectData;
  savedAt: number;
}

function readBackup(id: string): Backup | null {
  try {
    return JSON.parse(localStorage.getItem(backupKey(id)) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Loads a cloud project into the editor and autosaves it (docs, section 39):
 * change → local backup → debounce → API. Offline changes stay in localStorage
 * and are synchronised when the connection is back.
 */
export function useCloudProject(id: string) {
  const [meta, setMeta] = useState<Pick<Project, 'name' | 'version'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const version = useRef(0);
  const saving = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedRevision = useRef(0);

  const save = useCallback(
    async (snapshot = false) => {
      clearTimeout(timer.current);
      if (saving.current) {
        pending.current = true;
        return;
      }
      const { project, revision, floorId } = useEditor.getState();
      if (!snapshot && revision === savedRevision.current) return;
      saving.current = true;
      setSaveState('saving');
      try {
        const floor = project.floors.find((f) => f.id === floorId) ?? project.floors[0];
        const { project: saved } = await api.updateProject(id, {
          data: project,
          baseVersion: version.current,
          snapshot,
          thumbnail: renderThumbnail(project.floors[0].walls.length ? project.floors[0] : floor),
        });
        version.current = saved.version;
        savedRevision.current = revision;
        if (useEditor.getState().revision === revision) {
          localStorage.removeItem(backupKey(id));
          setSaveState('saved');
        } else {
          setSaveState('dirty');
          pending.current = true;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setSaveState('conflict');
        else if (e instanceof ApiError) setSaveState('error');
        else {
          setSaveState('offline');
          timer.current = setTimeout(() => save(), RETRY_MS);
        }
      } finally {
        saving.current = false;
        if (pending.current) {
          pending.current = false;
          timer.current = setTimeout(() => save(), 300);
        }
      }
    },
    [id],
  );

  // Initial load (+ restore of unsynchronised local changes)
  useEffect(() => {
    let cancelled = false;
    api
      .getProject(id)
      .then(({ project }) => {
        if (cancelled) return;
        version.current = project.version;
        savedRevision.current = 0;
        const backup = readBackup(id);
        const restore = backup && backup.baseVersion === project.version;
        useEditor.getState().load(restore ? backup.data : project.data);
        setMeta({ name: project.name, version: project.version });
        if (restore) {
          savedRevision.current = -1; // force a save of the restored data
          setSaveState('dirty');
          save();
        } else if (backup) {
          localStorage.removeItem(backupKey(id));
        }
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError && e.status === 404 ? 'Проект не найден' : 'Не удалось загрузить проект'));
    return () => {
      cancelled = true;
    };
  }, [id, save]);

  // Autosave on every committed change
  useEffect(() => {
    let last = useEditor.getState().revision;
    const unsub = useEditor.subscribe((s) => {
      if (s.revision === last) return;
      last = s.revision;
      if (!meta) return;
      try {
        localStorage.setItem(backupKey(id), JSON.stringify({ baseVersion: version.current, data: s.project, savedAt: Date.now() } satisfies Backup));
      } catch {
        /* storage full — rely on the network save */
      }
      setSaveState((st) => (st === 'conflict' ? st : 'dirty'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => save(), DEBOUNCE_MS);
    });
    return unsub;
  }, [id, meta, save]);

  useEffect(() => {
    const online = () => save();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().revision !== savedRevision.current) e.preventDefault();
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', beforeUnload);
      clearTimeout(timer.current);
    };
  }, [save]);

  const rename = useCallback(
    async (name: string) => {
      setMeta((m) => (m ? { ...m, name } : m));
      await api.updateProject(id, { name }).catch(() => setSaveState('error'));
    },
    [id],
  );

  /** Reload the server version (after a conflict or a version restore) */
  const reload = useCallback(async () => {
    const { project } = await api.getProject(id);
    localStorage.removeItem(backupKey(id));
    version.current = project.version;
    savedRevision.current = 0;
    useEditor.getState().load(project.data);
    setMeta({ name: project.name, version: project.version });
    setSaveState('saved');
  }, [id]);

  return { meta, error, saveState, save: () => save(true), rename, reload };
}
