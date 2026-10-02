import { useEffect, useState, type ReactNode } from 'react';
import { cmToUnit, roundForUnit, unitToCm, UNIT_LABELS, type Units } from '@spaceplan/shared';

/** Numeric input that displays centimetres in project units and commits on Enter / blur */
export function LengthField({
  label,
  valueCm,
  units,
  onCommit,
  min = 0,
}: {
  label: string;
  valueCm: number;
  units: Units;
  onCommit: (cm: number) => void;
  min?: number;
}) {
  const display = String(roundForUnit(cmToUnit(valueCm, units), units));
  const [text, setText] = useState(display);
  useEffect(() => setText(display), [display]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(v)) return setText(display);
    const cm = Math.max(min, unitToCm(v, units));
    if (Math.abs(cm - valueCm) > 0.01) onCommit(Math.round(cm * 10) / 10);
    else setText(display);
  };
  return (
    <Field label={label}>
      <div className="relative">
        <input
          className="input-sm pr-9"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-400">{UNIT_LABELS[units]}</span>
      </div>
    </Field>
  );
}

export function NumberField({ label, value, suffix, onCommit, step = 1 }: { label: string; value: number; suffix?: string; onCommit: (v: number) => void; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <Field label={label}>
      <div className="relative">
        <input
          className="input-sm pr-8"
          inputMode="decimal"
          step={step}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
      </div>
    </Field>
  );
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <input
        className="input-sm"
        value={text}
        maxLength={100}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== value && onCommit(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select className="input-sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-white" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="font-mono text-xs text-gray-500">{value}</span>
      </div>
    </Field>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-gray-100 p-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
