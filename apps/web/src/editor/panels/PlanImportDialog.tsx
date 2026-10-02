import { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, FileUp, Loader2, Sparkles } from 'lucide-react';
import { buildPlanGeometry, guessCmPerPixel, type RecognizedPlan } from '@spaceplan/shared';
import { api, ApiError, hasTokens } from '../../api/client';
import { useEditor } from '../store';
import { ImportPlanCommand } from '../commands';
import { detectWalls } from '../planImport/detectWalls';
import { loadPlanFile } from '../planImport/loadImage';
import { Dialog } from './Dialog';

type Method = 'ai' | 'local';
type Status = { kind: 'idle' } | { kind: 'loading'; text: string } | { kind: 'error'; text: string };

const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/**
 * "Plan from a photo / PDF": recognises walls, doors, windows and room names in a floor plan
 * image and builds an editable plan. Uses the AI recogniser on the server when it is
 * configured and the user is signed in, and the in-browser detector otherwise.
 */
export function PlanImportDialog({ onClose }: { onClose: () => void }) {
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [plan, setPlan] = useState<RecognizedPlan | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [widthM, setWidthM] = useState('');
  const [replace, setReplace] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (STATIC_DEMO || !hasTokens()) return;
    api
      .aiStatus()
      .then((r) => setAiAvailable(r.planRecognition))
      .catch(() => setAiAvailable(false));
  }, []);

  // Width of the recognised walls in pixels → user-facing scale in metres
  const extentPx = useMemo(() => {
    if (!plan?.walls.length) return 0;
    const xs = plan.walls.flatMap((w) => [w.x1, w.x2]);
    return Math.max(...xs) - Math.min(...xs);
  }, [plan]);

  const recognize = async (canvas: HTMLCanvasElement, method: Method) => {
    setPlan(null);
    try {
      let result: RecognizedPlan;
      if (method === 'ai') {
        setStatus({ kind: 'loading', text: 'AI изучает план: стены, двери, окна, подписи комнат… обычно 20–60 секунд' });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        result = (await api.recognizePlan({ image: dataUrl.split(',')[1], mediaType: 'image/jpeg', width: canvas.width, height: canvas.height })).plan;
      } else {
        setStatus({ kind: 'loading', text: 'Ищу стены на изображении…' });
        await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
        const ctx = canvas.getContext('2d')!;
        result = detectWalls(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }
      if (!result.walls.length) throw new Error('Стены не найдены. Попробуйте более чёткое изображение плана.');
      setPlan(result);
      const xs = result.walls.flatMap((w) => [w.x1, w.x2]);
      const k = result.cmPerPixel ?? guessCmPerPixel(result);
      setWidthM((((Math.max(...xs) - Math.min(...xs)) * k) / 100).toFixed(2));
      setStatus({ kind: 'idle' });
    } catch (e) {
      const text =
        e instanceof ApiError
          ? e.status === 422
            ? 'На изображении не найден план квартиры'
            : e.status === 429
              ? 'Слишком много запросов к AI, попробуйте через минуту'
              : 'AI сейчас недоступен — попробуйте локальное распознавание'
          : e instanceof Error
            ? e.message
            : 'Не удалось распознать план';
      setStatus({ kind: 'error', text });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setStatus({ kind: 'loading', text: 'Открываю файл…' });
      const canvas = await loadPlanFile(file);
      setImage(canvas);
      setPreview(canvas.toDataURL('image/jpeg', 0.85));
      await recognize(canvas, aiAvailable ? 'ai' : 'local');
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Не удалось открыть файл' });
    }
  };

  const build = () => {
    if (!plan) return;
    const meters = parseFloat(widthM.replace(',', '.'));
    const k = meters > 0 && extentPx > 0 ? (meters * 100) / extentPx : (plan.cmPerPixel ?? guessCmPerPixel(plan));
    const s = useEditor.getState();
    const floor = s.project.floors.find((f) => f.id === s.floorId)!;
    const geometry = buildPlanGeometry(plan, k, { wallHeight: floor.height });
    s.execute(ImportPlanCommand(s.floorId, geometry, replace));
    s.setView('2d');
    s.setTool('select');
    onClose();
    setTimeout(() => window.dispatchEvent(new Event('spaceplan:fit')), 50);
  };

  const busy = status.kind === 'loading';

  return (
    <Dialog title="План из фото или PDF" onClose={onClose} wide>
      {!image ? (
        <div className="space-y-4">
          <button
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center hover:border-brand-500"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            {busy ? <Loader2 className="animate-spin text-brand-600" /> : <FileUp className="text-brand-600" />}
            <span className="font-medium text-gray-800">{busy ? status.text : 'Перетащите план сюда или выберите файл'}</span>
            <span className="text-sm text-gray-500">JPG, PNG или PDF: план БТИ, планировка от застройщика, скан или фото</span>
          </button>
          <MethodNote aiAvailable={aiAvailable} />
          {status.kind === 'error' && <p className="text-sm text-red-600">{status.text}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
            <img src={preview ?? undefined} alt="" className="block w-full opacity-60" />
            {plan && <Overlay plan={plan} />}
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 p-6 text-center text-sm text-[#fff]">
                <Loader2 className="animate-spin" />
                {status.text}
              </div>
            )}
          </div>

          {status.kind === 'error' && <p className="text-sm text-red-600">{status.text}</p>}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">Распознавание:</span>
            {aiAvailable && (
              <button className={`btn-outline px-2.5 py-1 ${plan?.source === 'ai' ? 'ring-2 ring-brand-500' : ''}`} disabled={busy} onClick={() => recognize(image, 'ai')}>
                <Sparkles size={15} /> AI (Claude)
              </button>
            )}
            <button className={`btn-outline px-2.5 py-1 ${plan?.source === 'local' ? 'ring-2 ring-brand-500' : ''}`} disabled={busy} onClick={() => recognize(image, 'local')}>
              <Cpu size={15} /> Локально
            </button>
            <button className="btn-ghost px-2.5 py-1" disabled={busy} onClick={() => fileRef.current?.click()}>
              Другой файл
            </button>
          </div>

          {plan && (
            <div className="grid gap-3 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2">
              <div>
                <div className="font-medium text-gray-800">
                  Найдено: стен {plan.walls.length}, проёмов {plan.openings.length}
                  {plan.rooms.length ? `, комнат ${plan.rooms.length}` : ''}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {plan.cmPerPixel
                    ? 'Масштаб определён по размерам на чертеже — проверьте ширину.'
                    : 'Укажите реальную ширину плана, чтобы получить точные размеры.'}
                </p>
              </div>
              <label className="block">
                <span className="label">Общая ширина плана, м</span>
                <input className="input-sm" inputMode="decimal" value={widthM} onChange={(e) => setWidthM(e.target.value)} />
              </label>
              <div className="flex gap-4 sm:col-span-2">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={replace} onChange={() => setReplace(true)} /> Заменить текущий этаж
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={!replace} onChange={() => setReplace(false)} /> Добавить рядом
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn-primary" disabled={!plan || busy} onClick={build}>
              Построить план
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </Dialog>
  );
}

function MethodNote({ aiAvailable }: { aiAvailable: boolean }) {
  return (
    <p className="text-xs leading-relaxed text-gray-500">
      {aiAvailable ? (
        <>
          <b className="text-gray-700">AI (Claude)</b> читает стены, двери, окна, подписи комнат и размеры даже на фото под углом. Локальный режим работает без интернета на чётких сканах.
        </>
      ) : STATIC_DEMO || !hasTokens() ? (
        <>Локальное распознавание стен на чётких сканах и картинках. AI-распознавание фото с подписями комнат доступно после входа в аккаунт.</>
      ) : (
        <>Локальное распознавание стен на чётких сканах. AI-распознавание не настроено на сервере (нужен ANTHROPIC_API_KEY).</>
      )}
    </p>
  );
}

/** Recognised geometry drawn over the source image */
function Overlay({ plan }: { plan: RecognizedPlan }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${plan.imageWidth} ${plan.imageHeight}`} preserveAspectRatio="none">
      {plan.walls.map((w, i) => (
        <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#06b6d4" strokeOpacity={0.85} strokeWidth={Math.max(3, w.thickness)} strokeLinecap="square" />
      ))}
      {plan.openings.map((o, i) => (
        <circle key={i} cx={o.x} cy={o.y} r={Math.max(6, o.width / 2)} fill="none" stroke={o.kind === 'door' ? '#f59e0b' : '#38bdf8'} strokeWidth={3} />
      ))}
      {plan.rooms.map((r, i) => (
        <text key={i} x={r.x} y={r.y} fontSize={Math.max(14, plan.imageWidth / 50)} fill="#1d4ed8" fontWeight={700} textAnchor="middle">
          {r.name}
        </text>
      ))}
    </svg>
  );
}
