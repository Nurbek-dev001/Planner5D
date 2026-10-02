import { useEffect, useRef } from 'react';
import { MATERIALS, formatPrice, type MaterialTarget } from '@spaceplan/shared';
import { textureFor } from '../three/textures';

function Swatch({ id, color }: { id: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const mat = MATERIALS.find((m) => m.id === id)!;
    const tex = textureFor(mat);
    const c = ref.current!.getContext('2d')!;
    if (tex) c.drawImage(tex.image as HTMLCanvasElement, 0, 0, 256, 256, 0, 0, 40, 40);
    else {
      c.fillStyle = color;
      c.fillRect(0, 0, 40, 40);
    }
  }, [id, color]);
  return <canvas ref={ref} width={40} height={40} className="h-10 w-10 rounded-md" />;
}

/** Grid of library materials for walls / floors / furniture (docs, section 16) */
export function MaterialPicker({ target, value, onChange, label }: { target: MaterialTarget; value?: string; onChange: (id: string) => void; label: string }) {
  const list = MATERIALS.filter((m) => m.target === target);
  const current = list.find((m) => m.id === value);
  return (
    <div>
      <span className="label">
        {label}: <span className="text-gray-700">{current?.name ?? '—'}</span>
        {current?.pricePerM2 ? <span className="text-gray-400"> · {formatPrice(current.pricePerM2)}/м²</span> : null}
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {list.map((m) => (
          <button
            key={m.id}
            title={m.name}
            onClick={() => onChange(m.id)}
            className={`rounded-lg p-0.5 ring-2 transition ${m.id === value ? 'ring-brand-500' : 'ring-transparent hover:ring-gray-300'}`}
          >
            <Swatch id={m.id} color={m.baseColor} />
          </button>
        ))}
      </div>
    </div>
  );
}
