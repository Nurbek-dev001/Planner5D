import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { createProjectFromTemplate, projectDataSchema, type ProjectData } from '@spaceplan/shared';
import { Editor } from '../editor/Editor';
import { useEditor } from '../editor/store';

const KEY = 'spaceplan:demo';

/** Guest mode (docs, section 30): try the editor without an account; data stays in the browser */
export default function DemoPage() {
  const [ready, setReady] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let data: ProjectData | null = null;
    try {
      const parsed = projectDataSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
      if (parsed.success) data = parsed.data as ProjectData;
    } catch {
      /* ignore broken local data */
    }
    useEditor.getState().load(data ?? createProjectFromTemplate('two-room'));
    setReady(true);
    return useEditor.subscribe((s, prev) => {
      if (s.revision === prev.revision) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(s.project));
      } catch {
        /* storage unavailable: the demo still works in memory */
      }
    });
  }, []);

  if (!ready) return null;
  return (
    <Editor
      name="Демо-проект"
      saveState="local"
      backTo="/"
      headerExtra={
        <>
          <button
            className="btn-ghost"
            onBlur={() => setConfirmReset(false)}
            onClick={() => {
              // Two-step confirmation inside the page (native dialogs are unavailable in embedded viewers)
              if (!confirmReset) return setConfirmReset(true);
              setConfirmReset(false);
              try {
                localStorage.removeItem(KEY);
              } catch {
                /* ignore */
              }
              useEditor.getState().load(createProjectFromTemplate('two-room'));
            }}
          >
            {confirmReset ? 'Точно сбросить?' : 'Сбросить'}
          </button>
          {import.meta.env.VITE_STATIC_DEMO !== '1' && (
            <Link to="/register" className="btn-outline">
              Создать аккаунт
            </Link>
          )}
        </>
      }
    />
  );
}
