import { useEffect, useMemo, useRef, useState } from 'react';

export type PickerOption = { value: string; label: string; hint?: string; warning?: string };

type Props = {
  label: string;
  value: string | null;
  options: PickerOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
};

/** Search-as-you-type list. A button shows the current choice; tapping it opens a search panel. */
export default function Picker({ label, value, options, onChange, placeholder = 'Choose…', allowClear }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const text = `${o.label} ${o.hint ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className="picker-button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className={current ? '' : 'muted'}>{current?.label ?? placeholder}</span>
        {current?.hint && <span className="muted small"> · {current.hint}</span>}
      </button>
      {open && (
        <div className="picker-backdrop" onClick={() => setOpen(false)}>
          <div className="picker-panel" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <div className="picker-top">
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label.toLowerCase()}`}
                onKeyDown={(e) => e.key === 'Enter' && matches[0] && choose(matches[0].value)}
              />
              <button type="button" className="secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <ul className="picker-list">
              {allowClear && value && (
                <li>
                  <button type="button" onClick={() => choose(null)}>
                    <span className="muted">None</span>
                  </button>
                </li>
              )}
              {matches.map((o) => (
                <li key={o.value}>
                  <button type="button" className={o.value === value ? 'selected' : ''} onClick={() => choose(o.value)}>
                    <span>{o.label}</span>
                    {o.hint && <span className="muted small">{o.hint}</span>}
                    {o.warning && <span className="warn small">{o.warning}</span>}
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="muted empty">Nothing matches “{query}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
