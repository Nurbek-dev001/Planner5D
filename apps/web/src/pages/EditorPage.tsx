import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { History } from 'lucide-react';
import { Editor } from '../editor/Editor';
import { useCloudProject } from '../editor/useCloudProject';
import { VersionsDialog } from '../editor/panels/VersionsDialog';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  // Opened from "New project → upload a plan": start with the plan import dialog
  const [search] = useSearchParams();
  const { meta, error, saveState, save, rename, reload } = useCloudProject(id!);
  const [versionsOpen, setVersionsOpen] = useState(false);

  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-gray-600">{error}</p>
        <Link to="/dashboard" className="btn-primary">
          К проектам
        </Link>
      </div>
    );
  if (!meta) return <div className="flex h-full items-center justify-center text-gray-400">Загрузка проекта…</div>;

  return (
    <>
      <Editor
        name={meta.name}
        onRename={rename}
        saveState={saveState}
        onSave={save}
        backTo="/dashboard"
        initialImport={search.get('import') === '1'}
        headerExtra={
          <>
            {saveState === 'conflict' && (
              <button className="btn-outline text-red-600" onClick={() => confirm('Загрузить версию с сервера? Несохранённые изменения будут потеряны.') && reload()}>
                Обновить
              </button>
            )}
            <button className="btn-ghost" onClick={() => setVersionsOpen(true)} title="История версий">
              <History size={17} />
              <span className="hidden md:inline">Версии</span>
            </button>
          </>
        }
      />
      {versionsOpen && <VersionsDialog projectId={id!} onClose={() => setVersionsOpen(false)} onRestored={reload} />}
    </>
  );
}
