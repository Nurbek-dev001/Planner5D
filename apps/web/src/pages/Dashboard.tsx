import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, Copy, Download, FileUp, LogOut, MoreVertical, Pencil, Plus, Search, Sparkles, Trash2, Upload, LayoutTemplate, FilePlus2 } from 'lucide-react';
import { createProjectFromTemplate, projectDataSchema, TEMPLATES, type ProjectData } from '@spaceplan/shared';
import { api, ApiError, type ProjectSummary } from '../api/client';
import { useAuth } from '../store/auth';
import { Dialog } from '../editor/panels/Dialog';
import { renderThumbnail } from '../editor/thumbnail';
import { exportJson } from '../editor/export';

const ROLE_LABEL = { user: 'Free', premium: 'Premium', designer: 'Designer', admin: 'Admin' } as const;

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (q = search) =>
    api
      .listProjects(q || undefined)
      .then(({ projects }) => setProjects(projects))
      .catch(() => setError('Не удалось загрузить проекты'));

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка');
    }
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5">
          <Link to="/dashboard" className="flex items-center gap-2 text-lg font-bold text-brand-600">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            <span className="hidden sm:inline">SpacePlan</span>
          </Link>
          <div className="relative max-w-md flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Поиск проектов" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1" />
          <button className="btn-ghost px-2" title="Уведомления">
            <Bell size={18} />
          </button>
          <span className="hidden rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 sm:inline">{ROLE_LABEL[user!.role]}</span>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{user!.name.slice(0, 1).toUpperCase()}</div>
            <span className="hidden text-sm font-medium md:inline">{user!.name}</span>
          </div>
          <button
            className="btn-ghost px-2"
            title="Выйти"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-5">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Мои проекты</h1>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> Новый проект
          </button>
        </div>
        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            onClick={() => setCreating(true)}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand-500 hover:text-brand-600"
          >
            <Plus size={32} />
            <span className="font-medium">Создать проект</span>
          </button>
          {projects?.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => navigate(`/project/${p.id}`)}
              onRename={(name) => act(() => api.updateProject(p.id, { name }))}
              onDuplicate={() => act(() => api.duplicateProject(p.id))}
              onDelete={() => confirm(`Удалить «${p.name}»? Это действие необратимо.`) && act(() => api.deleteProject(p.id))}
              onExport={async () => {
                const { project } = await api.getProject(p.id);
                exportJson(project.name, project.data);
              }}
            />
          ))}
        </div>
        {projects && !projects.length && !search && <p className="mt-8 text-center text-gray-500">У вас пока нет проектов — создайте первый!</p>}
      </main>

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(id, openImport) => navigate(`/project/${id}${openImport ? '?import=1' : ''}`)}
          onError={(m) => {
            setCreating(false);
            setError(m);
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${danger ? 'text-red-600' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setMenu(false);
        fn();
      }}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="group relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 hover:shadow-md">
      <button className="block aspect-[16/10] w-full bg-slate-50" onClick={onOpen}>
        {project.thumbnail ? (
          <img src={project.thumbnail} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">Пустой план</div>
        )}
      </button>
      <div className="flex items-start justify-between gap-2 p-3">
        <button className="min-w-0 text-left" onClick={onOpen}>
          <div className="truncate font-medium">{project.name}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            {project.area.toFixed(1)} м² · {project.floorsCount} {project.floorsCount === 1 ? 'этаж' : 'этажа'} · {new Date(project.updatedAt).toLocaleDateString('ru-RU')}
          </div>
        </button>
        <div className="relative" ref={ref}>
          <button className="btn-ghost px-1.5" onClick={() => setMenu(!menu)} aria-label="Меню проекта">
            <MoreVertical size={16} />
          </button>
          {menu && (
            <div className="absolute right-0 bottom-full z-10 mb-1 w-48 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-gray-200">
              {item(<Pencil size={14} />, 'Открыть', onOpen)}
              {item(<Pencil size={14} />, 'Переименовать', () => {
                const name = prompt('Название проекта', project.name);
                if (name?.trim()) onRename(name.trim());
              })}
              {item(<Copy size={14} />, 'Создать копию', onDuplicate)}
              {item(<Download size={14} />, 'Экспорт JSON', onExport)}
              {item(<Trash2 size={14} />, 'Удалить', onDelete, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "New project" flow (docs, section 4): scratch / template / import / plan recognition; AI Generate is phase 2 */
function CreateProjectDialog({ onClose, onCreated, onError }: { onClose: () => void; onCreated: (id: string, openImport?: boolean) => void; onError: (m: string) => void }) {
  const [name, setName] = useState('Моя квартира');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = async (body: { templateId?: string; data?: ProjectData; name?: string }, openImport = false) => {
    setBusy(true);
    try {
      const { project } = await api.createProject({ name: body.name ?? name, ...body });
      const thumb = renderThumbnail(project.data.floors[0]);
      if (thumb) await api.updateProject(project.id, { thumbnail: thumb }).catch(() => {});
      onCreated(project.id, openImport);
    } catch (e) {
      onError(e instanceof ApiError ? (e.status === 402 ? 'Лимит бесплатного тарифа: 10 проектов' : e.message) : 'Ошибка создания проекта');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const parsed = projectDataSchema.safeParse(json.data ?? json);
      if (!parsed.success) throw new Error();
      await create({ data: parsed.data as ProjectData, name: json.name ?? file.name.replace(/\..*$/, '') });
    } catch {
      alert('Файл не похож на проект SpacePlan (.json)');
    }
  };

  return (
    <Dialog title="Новый проект" onClose={onClose} wide>
      <label className="mb-5 block">
        <span className="label">Название</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>

      <h3 className="mb-2 text-sm font-semibold text-gray-700">Начать</h3>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button disabled={busy} className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-left hover:border-brand-500" onClick={() => create({ templateId: 'empty' })}>
          <FilePlus2 className="text-brand-600" />
          <div>
            <div className="font-medium">С нуля</div>
            <div className="text-xs text-gray-500">Пустой холст</div>
          </div>
        </button>
        <button disabled={busy} className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-left hover:border-brand-500" onClick={() => fileRef.current?.click()}>
          <FileUp className="text-brand-600" />
          <div>
            <div className="font-medium">Импорт проекта</div>
            <div className="text-xs text-gray-500">Файл .spaceplan.json</div>
          </div>
        </button>
        <button
          disabled={busy}
          className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-left hover:border-brand-500"
          onClick={() => create({ templateId: 'empty' }, true)}
        >
          <Upload className="text-brand-600" />
          <div>
            <div className="font-medium">Загрузить план (JPG/PNG/PDF)</div>
            <div className="text-xs text-gray-500">AI распознаёт стены, двери, окна и комнаты</div>
          </div>
        </button>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 p-4 text-gray-400" title="Этап 2: AI Generate">
          <Sparkles />
          <div>
            <div className="font-medium">AI Generate</div>
            <div className="text-xs">Планировка по описанию — скоро</div>
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />

      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <LayoutTemplate size={16} /> Шаблоны
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.filter((t) => t.id !== 'empty').map((t) => (
          <button key={t.id} disabled={busy} className="overflow-hidden rounded-xl border border-gray-200 text-left hover:border-brand-500" onClick={() => create({ templateId: t.id })}>
            <TemplatePreview id={t.id} />
            <div className="p-3">
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-gray-500">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

const previews = new Map<string, string | null>();
function TemplatePreview({ id }: { id: string }) {
  if (!previews.has(id)) previews.set(id, renderThumbnail(createProjectFromTemplate(id).floors[0], 320, 160));
  const src = previews.get(id);
  return <div className="h-28 bg-slate-50">{src && <img src={src} alt="" className="h-full w-full object-contain" />}</div>;
}
