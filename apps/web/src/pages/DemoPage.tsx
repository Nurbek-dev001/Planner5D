import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { createProjectFromTemplate, projectDataSchema, type ProjectData } from '@spaceplan/shared';
import { Editor } from '../editor/Editor';
import { useEditor } from '../editor/store';

const KEY = 'spaceplan:demo';

/** Guest mode (docs, section 30): try the editor without an account; data stays in the browser */
export default function DemoPage() {
  const [ready, setReady] = useState(false);

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
      if (s.revision !== prev.revision) localStorage.setItem(KEY, JSON.stringify(s.project));
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
            onClick={() => {
              if (!confirm('Начать демо заново?')) return;
              localStorage.removeItem(KEY);
              useEditor.getState().load(createProjectFromTemplate('two-room'));
            }}
          >
            Сбросить
          </button>
          <Link to="/register" className="btn-outline">
            Создать аккаунт
          </Link>
        </>
      }
    />
  );
}
