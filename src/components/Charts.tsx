// Small hand-made charts for the Results screen (no chart library).
//
// Colour follows the team slot (slot-0 … slot-3, defined in App.css) so a character has the same
// colour on every chart; "other" (random drops, gear effects) is a neutral grey. Text never takes
// a series colour, every part has a tooltip and an accessible name, and values are also printed
// as text or in a table, so nothing depends on colour or hover alone.

import { useEffect, useMemo, useRef, useState } from 'react';

export type Part = {
  /** Shown in the legend and the tooltip. */
  label: string;
  value: number;
  /** Team slot 0-3 for its colour, or undefined for neutral grey. */
  slot?: number;
  /** Text printed inside the block when it fits (e.g. "47%"). */
  inside?: string;
  /** Extra tooltip text (e.g. "64,689 DPS"). */
  detail?: string;
};

export const slotClass = (slot: number | undefined) => (slot === undefined ? 'slot-other' : `slot-${slot}`);

/**
 * One whole split into parts, as a single horizontal bar. `tall` (28 px) prints each part's share
 * inside when it fits; thin bars carry no text (the list beside them does).
 */
export function SegmentedBar({ parts, label, tall = true }: { parts: Part[]; label: string; tall?: boolean }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div className={tall ? 'segbar tall' : 'segbar thin'} role="img" aria-label={`${label}: ${visible.map((p) => `${p.label} ${p.detail ?? p.inside ?? ''}`.trim()).join(', ')}`}>
      {visible.map((p, i) => {
        const share = p.value / total;
        return (
          <span
            key={`${p.label}${i}`}
            className={`seg ${slotClass(p.slot)}`}
            style={{ flexGrow: p.value }}
            title={`${p.label}${p.detail ? `: ${p.detail}` : ''}`}
            tabIndex={0}
            aria-label={`${p.label}${p.detail ? `: ${p.detail}` : ''}`}
          >
            {tall && p.inside && share >= 0.09 ? <span className="seg-label">{p.inside}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Names with their colour swatch, in a fixed order. */
export function Legend({ items }: { items: { label: string; slot?: number }[] }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label}>
          <span className={`swatch ${slotClass(it.slot)}`} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** A single-series line chart over time, with a crosshair and tooltip on hover or touch. */
export function LineChart({
  points,
  label,
  format,
  xLabel = 's',
}: {
  points: { time: number; dps: number }[];
  label: string;
  format: (v: number) => string;
  xLabel?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the real width it is shown at, so axis text stays a readable size on phones.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const H = Math.round(Math.min(260, Math.max(180, W * 0.45)));
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const maxT = points[points.length - 1]?.time ?? 1;
  const maxV = Math.max(...points.map((p) => p.dps), 1);
  const yTicks = useMemo(() => niceTicks(maxV, 4), [maxV]);
  const yMax = yTicks[yTicks.length - 1];
  // Fewer time labels on narrow screens so they don't crowd.
  const xStep = maxT > 120 || W < 420 ? 30 : 15;
  const x = (t: number) => pad.l + (t / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.dps).toFixed(1)}`).join('');

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * W;
    const time = ((t - pad.l) / (W - pad.l - pad.r)) * maxT;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].time - time) < Math.abs(points[best].time - time)) best = i;
    setHover(best);
  };
  const h = hover === null ? null : points[hover];

  return (
    <div className="linechart" ref={box}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text className="tick" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {compact(v)}
            </text>
          </g>
        ))}
        {Array.from({ length: Math.floor(maxT / xStep) + 1 }, (_, i) => i * xStep).map((t) => (
          <text key={t} className="tick" x={x(t)} y={H - 8} textAnchor="middle">
            {t}
            {xLabel}
          </text>
        ))}
        <path className="line" d={path} />
        {h && (
          <g>
            <line className="crosshair" x1={x(h.time)} x2={x(h.time)} y1={pad.t} y2={H - pad.b} />
            <circle className="dot" cx={x(h.time)} cy={y(h.dps)} r={5} />
          </g>
        )}
      </svg>
      <p className="chart-readout small" aria-live="polite">
        {h ? `At ${h.time.toFixed(1)} s: ${format(h.dps)}` : 'Hover or tap the chart to read a value.'}
      </p>
    </div>
  );
}

/** Rounded axis ticks from 0 up to at least `max`. */
function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** 136478 -> "136K", 1234567 -> "1.2M". */
export function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
}
