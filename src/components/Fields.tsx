import { useEffect, useState } from 'react';

/** A row of buttons where exactly one is chosen. */
export function Segmented<T extends string | number>({
  label,
  value,
  values,
  onChange,
  prefix = '',
  names,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
  prefix?: string;
  names?: Partial<Record<T, string>>;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {values.map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? 'selected' : ''} onClick={() => onChange(v)}>
            {names?.[v] ?? `${prefix}${v}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A number box that lets you type freely ("33." or "") and stores a number or nothing. */
export function NumberField({ label, value, suffix, onChange }: { label: string; value: number | undefined; suffix: string; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (value !== (text.trim() === '' ? undefined : Number(text.replace(',', '.')))) setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <label className="number-field">
      <span className="small">{label}</span>
      <span className="number-input">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const n = Number(t.replace(',', '.'));
            if (t.trim() === '') onChange(undefined);
            else if (Number.isFinite(n)) onChange(n);
          }}
          aria-label={label}
        />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </label>
  );
}
