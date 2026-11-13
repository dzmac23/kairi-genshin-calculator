// The Results screen: a summary first (team DPS, who does the damage, time lost), then detail
// sections that can be collapsed. Each character keeps its team-slot colour on every chart.

import { useMemo, useState, type ReactNode } from 'react';
import { Legend, LineChart, SegmentedBar, slotClass, type Part } from '../components/Charts';
import { isPlaceholderConfig, PLACEHOLDER_LABEL, PLACEHOLDER_NOTE } from '../placeholder';
import { FAILURES, summarize, type GcsimResult, type ResultsView, type Stat } from '../results/summarize';
import type { RotationTiming, Span, TurnTiming } from '../rotation/timing';
import type { FinishedRun } from '../useSimulation';

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const pct0 = (share: number) => `${Math.round(share * 100)}%`;
const secs = (n: number) => `${n.toFixed(1)} s`;
const range = (s: Stat, f: (n: number) => string) => `${f(s.min)} – ${f(s.max)}`;

const SOURCES_SHOWN = 10;

const SECTIONS = [
  { id: 'who', title: 'Who does the damage' },
  { id: 'time-lost', title: 'Time lost' },
  { id: 'timing', title: 'Rotation timing' },
  { id: 'over-time', title: 'Damage over the fight' },
  { id: 'sources', title: 'Damage by source' },
  { id: 'energy', title: 'Energy' },
  { id: 'reactions', title: 'Reactions' },
];

type Props = {
  run?: FinishedRun;
  /** The run's History name ("Successful Run – …"), once saved. */
  name?: string;
  label?: string;
  onRename?: (label: string) => void;
  /** True when showing a run opened from the History rather than the latest one. */
  olderRun?: boolean;
  onShowLatest?: () => void;
  onGoToRun: () => void;
};

export default function ResultsScreen({ run, name, label, onRename, olderRun, onShowLatest, onGoToRun }: Props) {
  const view = useMemo(() => (run ? summarize(run.result as GcsimResult) : undefined), [run]);

  if (!run || !view) {
    return (
      <section className="card">
        <h2>Results</h2>
        <p className="muted">No results yet. Run a simulation and the full breakdown will appear here.</p>
        <button onClick={onGoToRun}>Go to Run</button>
      </section>
    );
  }

  const hasTiming = !!run.timing;
  const keyToSlot = new Map(view.characters.map((c) => [c.key, c.slot]));

  return (
    <>
      {name && <RunTitle name={name} label={label} onRename={onRename} olderRun={olderRun} onShowLatest={onShowLatest} when={run.finishedAt} />}
      {isPlaceholderConfig(run.config) && (
        <div className="placeholder-note card">
          <strong>{PLACEHOLDER_LABEL}</strong>
          <p className="small">{PLACEHOLDER_NOTE}</p>
        </div>
      )}
      {run.notes.length > 0 && (
        <section className="card warnings">
          {run.notes.map((n) => (
            <div className="callout" key={n}>
              <p className="small">{n}</p>
            </div>
          ))}
        </section>
      )}

      <Summary view={view} run={run} />

      <nav className="jump" aria-label="Jump to a section">
        {SECTIONS.filter((s) => s.id !== 'timing' || hasTiming).map((s) => (
          <button
            key={s.id}
            className="chip"
            onClick={() => {
              const section = document.getElementById(s.id);
              const details = section?.querySelector('details');
              if (details && !details.open) details.open = true; // unfold it first
              section?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {s.title}
          </button>
        ))}
      </nav>

      <Section id="who" title="Who does the damage">
        <WhoDoesTheDamage view={view} />
      </Section>
      <Section id="time-lost" title="Time lost">
        <TimeLost view={view} />
      </Section>
      {hasTiming && (
        <Section id="timing" title="Rotation timing">
          <RotationTimingSection timing={run.timing!} keyToSlot={keyToSlot} view={view} />
        </Section>
      )}
      <Section id="over-time" title="Damage over the fight">
        <DamageOverTimeSection view={view} />
      </Section>
      <Section id="sources" title="Damage by source">
        <Sources view={view} />
      </Section>
      <Section id="energy" title="Energy">
        <Energy view={view} />
      </Section>
      <Section id="reactions" title="Reactions">
        <Reactions view={view} />
      </Section>
    </>
  );
}

function RunTitle({
  name,
  label,
  onRename,
  olderRun,
  onShowLatest,
  when,
}: {
  name: string;
  label?: string;
  onRename?: (label: string) => void;
  olderRun?: boolean;
  onShowLatest?: () => void;
  when: Date;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label ?? '');
  return (
    <section className="card run-title">
      {editing && onRename ? (
        <div className="rename">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name this run (empty = character names)" aria-label="Run name" autoFocus />
          <button
            className="small-button"
            onClick={() => {
              onRename(draft);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button className="link small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="card-head">
          <strong>{name}</strong>
          {onRename && (
            <button
              className="link small"
              onClick={() => {
                setDraft(label ?? '');
                setEditing(true);
              }}
            >
              Rename
            </button>
          )}
        </div>
      )}
      <p className="muted small">
        {when.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        {olderRun && ' · a saved run from your History'}
        {olderRun && onShowLatest && (
          <>
            {' · '}
            <button className="link small" onClick={onShowLatest}>
              Show the latest run
            </button>
          </>
        )}
      </p>
    </section>
  );
}

/** On phones only these sections start open; the rest start folded to keep the page short. */
const OPEN_ON_PHONE = new Set(['who', 'time-lost']);
const openKey = (id: string) => `results-open:${id}`;

/** Whether a section starts open: as you last left it on this device, else the phone/laptop default. */
function initiallyOpen(id: string): boolean {
  try {
    const saved = localStorage.getItem(openKey(id));
    if (saved !== null) return saved === '1';
  } catch {
    // Storage unavailable (e.g. private browsing): use the default.
  }
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
  return !narrow || OPEN_ON_PHONE.has(id);
}

/** A collapsible card. Tap the title to fold or unfold it; the choice is remembered on this device. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => initiallyOpen(id));
  return (
    <section className="card" id={id}>
      <details
        open={open}
        className="section"
        onToggle={(e) => {
          const now = (e.currentTarget as HTMLDetailsElement).open;
          setOpen(now);
          try {
            localStorage.setItem(openKey(id), now ? '1' : '0');
          } catch {
            // Not remembered; that's fine.
          }
        }}
      >
        <summary>
          <h2>{title}</h2>
        </summary>
        {open && children}
      </details>
    </section>
  );
}

/** A small "What is this?" toggle holding an explanation, so it doesn't take up space until wanted. */
function Info({ children }: { children: ReactNode }) {
  return (
    <details className="info">
      <summary>ⓘ What is this?</summary>
      <p className="small muted">{children}</p>
    </details>
  );
}

function Summary({ view, run }: { view: ResultsView; run: FinishedRun }) {
  return (
    <section className="card">
      <h2>Team DPS</h2>
      <p className="big hero">{fmt(view.teamDps.mean)}</p>
      <p className="precision">Accurate to about ±{fmt(view.precision)}</p>
      <Info>
        Every simulated fight is a little different (crits, energy drops), so the team DPS is an average. With{' '}
        {view.iterations.toLocaleString()} fights, the true average is very likely within ±{fmt(view.precision)} of{' '}
        {fmt(view.teamDps.mean)}. Differences between two runs smaller than that may just be luck; more fights make it
        more precise.
      </Info>
      <dl className="stats">
        <dt>Typical spread between fights</dt>
        <dd>±{fmt(view.teamDps.sd)}</dd>
        <dt>Worst – best fight</dt>
        <dd>{range(view.teamDps, fmt)}</dd>
        <dt>Simulated fights</dt>
        <dd>{view.iterations.toLocaleString()}</dd>
        <dt>Fight length</dt>
        <dd>{secs(view.duration)}</dd>
      </dl>
      <p className="muted small">
        Finished {run.finishedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} in {run.seconds.toFixed(1)} s.
      </p>
    </section>
  );
}

function WhoDoesTheDamage({ view }: { view: ResultsView }) {
  const legend = view.characters.map((c) => ({ label: c.name, slot: c.slot }));
  const dpsParts: Part[] = view.characters.map((c) => ({
    label: c.name,
    slot: c.slot,
    value: c.dps.mean,
    inside: pct0(c.share),
    detail: `${fmt(c.dps.mean)} DPS (${pct(c.share)})`,
  }));
  const fieldParts: Part[] = view.characters.map((c) => ({
    label: c.name,
    slot: c.slot,
    value: c.fieldTime.mean,
    inside: pct0(c.fieldShare),
    detail: `${secs(c.fieldTime.mean)} on field (${pct(c.fieldShare)})`,
  }));
  return (
    <>
      <p className="bar-title">Share of team damage</p>
      <SegmentedBar parts={dpsParts} label="Share of team damage" />
      <p className="bar-title">Time on field</p>
      <SegmentedBar parts={fieldParts} label="Time on field" />
      <Legend items={legend} />
      <ul className="char-list only-narrow">
        {view.characters.map((c) => (
          <li key={c.key}>
            <div className="char-line">
              <span>
                <span className={`swatch ${slotClass(c.slot)}`} aria-hidden="true" />
                <strong>{c.name}</strong>
              </span>
              <span className="right">{fmt(c.dps.mean)} DPS</span>
            </div>
            <div className="muted small">
              {pct0(c.share)} of damage · {pct0(c.fieldShare)} on field ({secs(c.fieldTime.mean)})
              {c.endingEnergy ? ` · ${fmt(c.endingEnergy.mean)} energy left` : ''}
            </div>
          </li>
        ))}
      </ul>
      <table className="table compact-table only-wide">
        <thead>
          <tr>
            <th>Character</th>
            <th className="num">DPS</th>
            <th className="num">Share</th>
            <th className="num">On field</th>
            <th className="num">Energy left</th>
          </tr>
        </thead>
        <tbody>
          {view.characters.map((c) => (
            <tr key={c.key}>
              <td>
                <span className={`swatch ${slotClass(c.slot)}`} aria-hidden="true" />
                {c.name}
                <div className="muted small">
                  {c.element.charAt(0).toUpperCase() + c.element.slice(1)} · ±{fmt(c.dps.sd)} spread
                </div>
              </td>
              <td className="num">{fmt(c.dps.mean)}</td>
              <td className="num">{pct(c.share)}</td>
              <td className="num">
                {secs(c.fieldTime.mean)}
                <div className="muted small">{pct(c.fieldShare)}</div>
              </td>
              <td className="num">{c.endingEnergy ? fmt(c.endingEnergy.mean) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Info>
        Damage share is how much of the team's damage each character deals; time on field is how long they are the active
        character. A character with a bigger damage share than field time is doing a lot from off-field. "Energy left" is
        their energy when the fight ends.
      </Info>
    </>
  );
}

function TimeLost({ view }: { view: ResultsView }) {
  const warned = view.warnings;
  const smaller = view.timeLost.filter((r) => !r.warned);
  if (view.timeLost.length === 0 && warned.length === 0) {
    return <p>No time lost: nobody had to wait for a cooldown, energy or stamina.</p>;
  }
  return (
    <>
      <Info>
        Time a character stood idle because the rotation asked for something that wasn't ready yet. gcsim warns when it is
        1 second or more per fight; smaller delays are listed below the warnings.
      </Info>
      {warned.map((w) => (
        <div className="callout warn-callout" key={w.kind}>
          <strong>{w.title}</strong>
          <p className="small">{w.advice}</p>
          {w.rows.length > 0 && (
            <ul className="small">
              {w.rows.map((r) => (
                <li key={r.character}>
                  {r.character} waited <strong>{secs(r.seconds.mean)}</strong> per fight on average (worst fight {secs(r.seconds.max)}).
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {smaller.length > 0 && (
        <>
          <p className="bar-title">{warned.length ? 'Smaller delays' : 'Small delays (under gcsim’s warning level)'}</p>
          <table className="table">
            <thead>
              <tr>
                <th>Character</th>
                <th>Waiting for</th>
                <th className="num">Average</th>
                <th className="num">Worst</th>
              </tr>
            </thead>
            <tbody>
              {smaller.map((r) => (
                <tr key={`${r.character}|${r.kind}`}>
                  <td>{r.character}</td>
                  <td>{FAILURES[r.kind].label.replace(/^Waiting for /, '')}</td>
                  <td className="num">{secs(r.seconds.mean)}</td>
                  <td className="num">{secs(r.seconds.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

const span = (s: Span) => `${s.mean.toFixed(1)} s`;
const spread = (s: Span) => `${s.min.toFixed(1)}–${s.max.toFixed(1)} s`;
/**
 * A turn "varies a lot" when its slowest time is well above its fastest (at least 1.5 s and 30% of
 * its average): usually waiting, or a ? / @ move that only happens in some loops.
 */
const variesALot = (s: Span) => s.max - s.min >= Math.max(1.5, s.mean * 0.3);

function RotationTimingSection({
  timing,
  keyToSlot,
  view,
}: {
  timing: FinishedRun['timing'];
  keyToSlot: Map<string, number>;
  view: ResultsView;
}) {
  if (timing === 'measuring') return <p className="muted">Measuring rotation timing…</p>;
  if (timing === 'failed' || !timing) return <p className="muted">Rotation timing couldn't be measured for this run.</p>;
  return <RotationTimingTables timing={timing} keyToSlot={keyToSlot} view={view} />;
}

function RotationTimingTables({ timing, keyToSlot, view }: { timing: RotationTiming; keyToSlot: Map<string, number>; view: ResultsView }) {
  const opener = timing.turns.filter((t) => t.section === 'opener');
  const loop = timing.turns.filter((t) => t.section === 'loop');
  const loopTotal = timing.loop?.mean ?? 0;
  const name = (t: TurnTiming) => (t.text.startsWith('!') ? 'gcsim line' : t.text.split(/\s+/)[0]);
  const parts: Part[] = loop
    .filter((t) => t.time && t.time.mean > 0)
    .map((t) => ({
      label: `Turn ${t.index}: ${t.text}`,
      slot: t.key ? keyToSlot.get(t.key) : undefined,
      value: t.time!.mean,
      inside: `${name(t)} ${t.time!.mean.toFixed(1)}s`,
      detail: `${span(t.time!)} (${pct0(t.time!.mean / (loopTotal || 1))} of the loop)`,
    }));
  return (
    <>
      <dl className="stats">
        {timing.opener && (
          <>
            <dt>Opener length</dt>
            <dd>{span(timing.opener)}</dd>
          </>
        )}
        <dt>Loop length (one cycle)</dt>
        <dd>
          {timing.loop ? (
            <>
              {span(timing.loop)} <span className="muted small">({spread(timing.loop)})</span>
            </>
          ) : (
            'longer than the fight'
          )}
        </dd>
        {timing.loopsPerFight !== undefined && (
          <>
            <dt>Loops in the fight</dt>
            <dd>{timing.loopsPerFight.toFixed(1)}</dd>
          </>
        )}
      </dl>

      {parts.length > 0 && (
        <>
          <p className="bar-title">One loop, turn by turn</p>
          <SegmentedBar parts={parts} label="One loop, turn by turn" />
          <Legend items={view.characters.map((c) => ({ label: c.name, slot: c.slot }))} />
        </>
      )}

      {opener.length > 0 && <TurnTable title="Opener" turns={opener} total={timing.opener} keyToSlot={keyToSlot} />}
      <TurnTable title="Loop" turns={loop} total={timing.loop} keyToSlot={keyToSlot} shareOf={loopTotal} />

      <details className="how-to-read">
        <summary>How to read this</summary>
        <p className="small muted">
          The Opener runs once; the Loop repeats until the fight ends. A turn's time runs from when gcsim starts it until it
          starts the next turn, so the swap in and any waiting (for a cooldown or energy) count toward that turn, and the
          Loop's turns add up to one loop. A very short turn means the next character could swap in early, not that the
          animation is that short. Times are averaged over {timing.replays} replayed fights; only complete loops are
          counted. A turn tagged “⚠ varies” has a slowest time well above its fastest (at least 1.5 s and 30%): usually
          waiting, which Time lost above explains, or a ? / @ move that only happens in some loops.
        </p>
      </details>
    </>
  );
}

function TurnTable({
  title,
  turns,
  total,
  keyToSlot,
  shareOf,
}: {
  title: string;
  turns: TurnTiming[];
  total?: Span;
  keyToSlot: Map<string, number>;
  shareOf?: number;
}) {
  return (
    <>
      <p className="bar-title">{title}</p>
      <table className="table turn-table">
        <tbody>
          {turns.map((t) => {
            const slot = t.key ? keyToSlot.get(t.key) : undefined;
            return (
              <tr key={`${t.section}${t.index}`}>
                <td>
                  <span className={`swatch ${slotClass(slot)}`} aria-hidden="true" />
                  <code className="turn-text">{t.text}</code>
                  {shareOf !== undefined && t.time && (
                    <div className="bar thin" aria-hidden="true">
                      <span className={slotClass(slot)} style={{ width: pct(Math.min(1, t.time.mean / (shareOf || 1))) }} />
                    </div>
                  )}
                  {t.skipped > 0 && (
                    <div className="muted small">
                      Skipped in {t.skipped} of {t.measured} {t.section === 'opener' ? 'fights' : 'loops'}
                    </div>
                  )}
                  {t.time && variesALot(t.time) && <span className="tag warn-tag">⚠ varies {spread(t.time)}</span>}
                </td>
                <td className="num">
                  {t.time ? span(t.time) : '–'}
                  {t.time && t.time.max - t.time.min >= 0.05 && <div className="muted small">{spread(t.time)}</div>}
                </td>
              </tr>
            );
          })}
          {total && (
            <tr className="total-row">
              <td>Total {title.toLowerCase()}</td>
              <td className="num">{span(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function DamageOverTimeSection({ view }: { view: ResultsView }) {
  const d = view.damageOverTime;
  const [showTable, setShowTable] = useState(false);
  if (!d) return <p className="muted">This result doesn't include damage over time.</p>;
  const peak = d.points.reduce((a, p) => (p.dps > a.dps ? p : a), d.points[0]);
  const low = d.points.reduce((a, p) => (p.dps < a.dps ? p : a), d.points[0]);
  const step = Math.max(1, Math.round(5 / (d.points[1]?.time - d.points[0]?.time || 0.5)));
  return (
    <>
      <Info>
        Team damage per second through the fight, smoothed over {d.windowSeconds} seconds and averaged over all simulated
        fights. Peaks are burst windows; dips are downtime. Tap or hover the chart for exact values.
      </Info>
      <LineChart points={d.points} label={`Team DPS over the fight. Peak ${fmt(peak.dps)} at ${peak.time.toFixed(0)} s.`} format={(v) => `${fmt(v)} DPS`} />
      <p className="small">
        Peak <strong>{fmt(peak.dps)}</strong> DPS around {peak.time.toFixed(0)} s · lowest {fmt(low.dps)} around {low.time.toFixed(0)} s ·
        average {fmt(view.teamDps.mean)}.
      </p>
      <button className="secondary" onClick={() => setShowTable(!showTable)}>
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th className="num">DPS ({d.windowSeconds} s average)</th>
            </tr>
          </thead>
          <tbody>
            {d.points.filter((_, i) => i % step === 0).map((p) => (
              <tr key={p.time}>
                <td>{p.time.toFixed(0)} s</td>
                <td className="num">{fmt(p.dps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Sources({ view }: { view: ResultsView }) {
  const [showAll, setShowAll] = useState(false);
  const sources = showAll ? view.sources : view.sources.slice(0, SOURCES_SHOWN);
  const maxSource = view.sources[0]?.dps ?? 1;
  return (
    <>
      <Info>Every attack, highest first, as DPS and its share of the team total, coloured by character.</Info>
      <Legend items={view.characters.map((c) => ({ label: c.name, slot: c.slot }))} />
      <ol className="sources">
        {sources.map((s) => (
          <li key={`${s.character}|${s.source}`}>
            <div className="source-head">
              <span>
                {s.source}
                <span className="muted"> · {s.character}</span>
              </span>
              <span className="right">
                {fmt(s.dps)} <span className="muted">({pct(s.share)})</span>
              </span>
            </div>
            <div className="bar thin" aria-hidden="true">
              <span className={slotClass(s.slot)} style={{ width: pct(s.dps / maxSource) }} />
            </div>
          </li>
        ))}
      </ol>
      {view.sources.length > SOURCES_SHOWN && (
        <button className="secondary" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show top 10' : `Show all ${view.sources.length}`}
        </button>
      )}
    </>
  );
}

const ENERGY_SHOWN = 4;

function Energy({ view }: { view: ResultsView }) {
  return (
    <>
      <Info>
        Energy each character received over the whole fight, and where it came from: a teammate's particles or flat
        energy, random drops, normal/charged attack hits, gear and so on. Useful when gcsim says someone waits for burst
        energy: it shows whether they need more Energy Recharge or more particles.
      </Info>
      {view.energy.map((e) => (
        <EnergyCard key={e.character} energy={e} left={view.characters[e.slot].endingEnergy?.mean} />
      ))}
    </>
  );
}

function EnergyCard({ energy: e, left }: { energy: ResultsView['energy'][number]; left?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? e.sources : e.sources.slice(0, ENERGY_SHOWN);
  return (
    <div className="energy-row">
      <div className="energy-head">
        <span>
          <span className={`swatch ${slotClass(e.slot)}`} aria-hidden="true" />
          <strong>{e.character}</strong>
        </span>
        <span className="right">
          {fmt(e.total)} received{left !== undefined ? <span className="muted"> · {fmt(left)} left</span> : null}
        </span>
      </div>
      <SegmentedBar
        tall={false}
        label={`${e.character}'s energy sources`}
        parts={e.sources.map((s) => ({ label: s.label, value: s.amount, slot: s.fromSlot, detail: `${s.amount.toFixed(1)} energy` }))}
      />
      <ul className="energy-sources">
        {shown.map((s) => (
          <li key={s.label}>
            <span>
              <span className={`swatch ${slotClass(s.fromSlot)}`} aria-hidden="true" />
              {s.label}
            </span>
            <span className="right">{s.amount.toFixed(1)}</span>
          </li>
        ))}
      </ul>
      {e.sources.length > ENERGY_SHOWN && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `+${e.sources.length - ENERGY_SHOWN} more`}
        </button>
      )}
    </div>
  );
}

function Reactions({ view }: { view: ResultsView }) {
  if (view.reactionTotals.length === 0) return <p className="muted">No reactions in this run.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Reaction</th>
          <th className="num">Per fight</th>
        </tr>
      </thead>
      <tbody>
        {view.reactionTotals.map((r) => (
          <tr key={r.reaction}>
            <td>
              {r.reaction}
              <div className="muted small">{r.by.map((b) => `${b.character} ${b.perFight.toFixed(1)}`).join(' · ')}</div>
            </td>
            <td className="num">{r.perFight.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

