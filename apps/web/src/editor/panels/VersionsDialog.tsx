import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api, type ProjectVersion } from '../../api/client';
import { Dialog } from './Dialog';

/** Project version history with restore (docs, section 26) */
export function VersionsDialog({ projectId, onClose, onRestored }: { projectId: string; onClose: () => void; onRestored: () => void }) {
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.versions(projectId).then(({ versions }) => setVersions(versions)).catch(() => setVersions([]));
  }, [projectId]);

  const restore = async (v: ProjectVersion) => {
    if (!confirm(`Восстановить версию ${v.version}? Текущее состояние сохранится как отдельная версия.`)) return;
    setBusy(v.id);
    try {
      await api.restoreVersion(projectId, v.id);
      onRestored();
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `Сегодня ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Вчера ${time}`;
    return `${d.toLocaleDateString('ru-RU')} ${time}`;
  };

  return (
    <Dialog title="История версий" onClose={onClose}>
      {!versions ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : !versions.length ? (
        <p className="text-sm text-gray-500">Версий пока нет.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <History size={16} className="text-gray-400" />
                <div>
                  <div className="text-sm font-medium">
                    Версия {v.version} {i === 0 && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">последняя</span>}
                  </div>
                  <div className="text-xs text-gray-500">{fmt(v.createdAt)}</div>
                </div>
              </div>
              {i > 0 && (
                <button className="btn-outline" disabled={busy !== null} onClick={() => restore(v)}>
                  {busy === v.id ? 'Восстановление…' : 'Восстановить'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-400">Версия сохраняется при ручном сохранении и автоматически не реже раза в 10 минут работы.</p>
    </Dialog>
  );
}
