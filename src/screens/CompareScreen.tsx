// Compare two runs: Scenario A and Scenario B, each from the History or a run file.

import { useMemo, useState, type ReactNode } from 'react';
import { Legend, SegmentedBar, slotClass, type Part } from '../components/Charts';
import { compareRuns, verdictText, type Comparison } from '../compare/compare';
import { runDps, runName, type RunRecord } from '../history/model';
import { readTransferFile } from '../transfer';

export type Side = 'a' | 'b';

type Props = {
  runs: RunRecord[];
  a?: RunRecord;
  b?: RunRecord;
  onPick: (side: Side, run: RunRecord | undefined) => void;
  onSwap: () => void;
  /** When on, every new run becomes Scenario B ("tweak and compare"). */
  autoB: boolean;
  onAutoB: (on: boolean) => void;
  onGoToRun: () => void;
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secs = (n: number) => `${n.toFixed(1)} s`;
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "▲ +1,234" / "▼ −567": arrow and sign, so the direction never depends on colour alone. */
function Delta({
  value,
  format,
  lowerIsBetter = false,
  minimum = 0.5,
}: {
  value: number;
  format: (n: number) => string;
  lowerIsBetter?: boolean;
  /** Differences smaller than this (e.g. 0.1 s) show as "no change" rather than as noise. */
  minimum?: number;
}) {
  if (Math.abs(value) < minimum) return <span className="muted">no change</span>;
  const up = value > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={good ? 'delta good' : 'delta bad'}>
      {up ? '▲ +' : '▼ −'}
      {format(Math.abs(value))}
    </span>
  );
}

function Info({ children }: { children: ReactNode }) {
  return (
    <details className="info">
      <summary>ⓘ What is this?</summary>
      <p className="small muted">{children}</p>
    </details>
  );
}

export default function CompareScreen(p: Props) {
  const comparison = useMemo(() => (p.a && p.b ? compareRuns(p.a, p.b) : undefined), [p.a, p.b]);
  return (
    <>
      <section className="card">
        <h2>Compare two runs</h2>
        <p className="muted small">
          Pick Scenario A and Scenario B from your History, or import a run file (imported here, it isn't added to your
          History). Works for different teams, or the same team with a different rotation, weapon or artifacts.
        </p>
        <div className="scenarios">
          <ScenarioPicker side="a" runs={p.runs} chosen={p.a} onPick={(r) => p.onPick('a', r)} />
          <ScenarioPicker side="b" runs={p.runs} chosen={p.b} onPick={(r) => p.onPick('b', r)} />
        </div>
        <div className="button-row">
          <button className="secondary small-button" onClick={p.onSwap} disabled={!p.a && !p.b}>
            ⇄ Swap A and B
          </button>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={p.autoB} onChange={(e) => p.onAutoB(e.target.checked)} />
          <span className="small">
            Use my next run as Scenario B
            <span className="muted"> (for tweaking: change something, run again, and see the difference here)</span>
          </span>
        </label>
        {p.autoB && (
          <button className="secondary small-button" onClick={p.onGoToRun}>
            Go to Run
          </button>
        )}
      </section>
      {comparison && <ComparisonView c={comparison} a={p.a!} b={p.b!} />}
    </>
  );
}

function ScenarioPicker({ side, runs, chosen, onPick }: { side: Side; runs: RunRecord[]; chosen?: RunRecord; onPick: (r: RunRecord | undefined) => void }) {
  const [fileRuns, setFileRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState('');
  const label = side === 'a' ? 'Scenario A' : 'Scenario B';
  const fromHistory = chosen && runs.some((r) => r.id === chosen.id);
  const onFile = async (file: File) => {
    setError('');
    const preview = readTransferFile(await file.text(), { runIds: new Set(), teamIds: new Set() });
    if (preview.error) return setError(preview.error);
    if (preview.runs.length === 0) return setError('This file has no runs.');
    if (preview.runs.length === 1) {
      setFileRuns(null);
      onPick(preview.runs[0]);
    } else setFileRuns(preview.runs);
  };
  return (
    <div className={`scenario scenario-${side}`}>
      <p className="scenario-label">{label}</p>
      <select
        aria-label={`${label}: pick a run from your History`}
        value={fromHistory ? chosen!.id : ''}
        onChange={(e) => onPick(runs.find((r) => r.id === e.target.value))}
      >
        <option value="">{chosen && !fromHistory ? 'From a file (not in History)' : 'Pick a run from History…'}</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {runName(r)} · {when(r.createdAt)} · {fmt(runDps(r))}
          </option>
        ))}
      </select>
      <label className="link small file-link">
        Import a run file…
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </label>
      {fileRuns && (
        <select aria-label={`${label}: pick a run from the file`} value="" onChange={(e) => (onPick(fileRuns.find((r) => r.id === e.target.value)), setFileRuns(null))}>
          <option value="">This file has {fileRuns.length} runs: pick one…</option>
          {fileRuns.map((r) => (
            <option key={r.id} value={r.id}>
              {runName(r)} · {fmt(runDps(r))}
            </option>
          ))}
        </select>
      )}
      {error && <p className="warn small">{error}</p>}
      {chosen && (
        <div className="scenario-chosen">
          <strong>{runName(chosen)}</strong>
          <span className="muted small">
            {when(chosen.createdAt)} · {fmt(runDps(chosen))} DPS{!fromHistory ? ' · from a file' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function ComparisonView({ c, a, b }: { c: Comparison; a: RunRecord; b: RunRecord }) {
  const fightsA = c.viewA.iterations;
  const fightsB = c.viewB.iterations;
  return (
    <>
      <section className={`card verdict verdict-${c.dps.verdict}`}>
        <h2>Verdict</h2>
        <p className="verdict-text">{verdictText(c.dps)}.</p>
        <div className="ab-numbers">
          <span>
            <span className="muted small">A</span> {fmt(c.dps.a)}
          </span>
          <span className="muted">→</span>
          <span>
            <span className="muted small">B</span> {fmt(c.dps.b)}
          </span>
        </div>
        {c.dps.verdict === 'too-close' && Math.min(fightsA, fightsB) < 1000 && (
          <p className="small">Tip: run both with 1,000 fights for a sharper answer (A used {fightsA}, B used {fightsB}).</p>
        )}
        <Info>
          Each run's team DPS is an average over its simulated fights, so it wobbles a little by chance. With these runs,
          randomness alone could explain a difference of up to about ±{fmt(c.dps.margin)} DPS (95% confidence). A bigger
          difference is real; a smaller one is too close to call. More fights make this margin smaller.
        </Info>
      </section>

      {c.fairness.length > 0 && (
        <section className="card warnings">
          <div className="callout warn-callout">
            <strong>Not a like-for-like comparison</strong>
            <ul className="small">
              {c.fairness.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="small">Differences in DPS may come from these as well as from the teams themselves.</p>
          </div>
        </section>
      )}

      <section className="card">
        <h2>What changed</h2>
        {!c.sameTeam && <p className="small">Different teams: {c.viewA.characters.map((x) => x.name).join(', ')} vs {c.viewB.characters.map((x) => x.name).join(', ')}.</p>}
        {c.changes.length === 0 ? (
          <p className="muted small">{c.sameTeam ? 'No differences in the builds, rotation or number of fights.' : 'No other input differences recorded.'}</p>
        ) : (
          <ul className="changes small">
            {c.changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {!(a.team && b.team) && (
          <p className="muted small">For pasted configs and runs without saved inputs, changes are listed line by line from the gcsim config.</p>
        )}
      </section>

      {c.sameTeam ? <SameTeam c={c} /> : <DifferentTeams c={c} />}

      {c.timing && (
        <section className="card">
          <h2>Rotation timing</h2>
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th className="num">A</th>
                <th className="num">B</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Loop length', c.timing.loopA, c.timing.loopB, secs, true],
                ['Loops in the fight', c.timing.loopsA, c.timing.loopsB, (n: number) => n.toFixed(1), false],
                ['Opener length', c.timing.openerA, c.timing.openerB, secs, true],
              ]
                .filter(([, x, y]) => x !== undefined || y !== undefined)
                .map(([label, x, y, f, lower]) => {
                  const format = f as (n: number) => string;
                  return (
                    <tr key={label as string}>
                      <td>{label as string}</td>
                      <td className="num">{x !== undefined ? format(x as number) : '–'}</td>
                      <td className="num">{y !== undefined ? format(y as number) : '–'}</td>
                      <td className="num">
                        {x !== undefined && y !== undefined ? <Delta value={(y as number) - (x as number)} format={format} lowerIsBetter={lower as boolean} minimum={0.05} /> : '–'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}

      {c.timeLost.length > 0 && (
        <section className="card">
          <h2>Time lost</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Character</th>
                <th className="num">A</th>
                <th className="num">B</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {c.timeLost.map((t) => (
                <tr key={`${t.character}|${t.label}`}>
                  <td>
                    {t.character}
                    <div className="muted small">{t.label.replace(/^Waiting for /, 'waiting for ')}</div>
                  </td>
                  <td className="num">{secs(t.a)}</td>
                  <td className="num">{secs(t.b)}</td>
                  <td className="num">
                    <Delta value={t.diff} format={secs} lowerIsBetter minimum={0.15} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function SameTeam({ c }: { c: Comparison }) {
  const max = Math.max(...c.characters.flatMap((x) => [x.dpsA, x.dpsB]), 1);
  const [allSources, setAllSources] = useState(false);
  const sources = allSources ? c.sources : c.sources.slice(0, 10);
  return (
    <>
      <section className="card">
        <h2>Characters</h2>
        <ul className="compare-chars">
          {c.characters.map((x) => (
            <li key={x.name}>
              <div className="char-line">
                <span>
                  <span className={`swatch ${slotClass(x.slotA)}`} aria-hidden="true" />
                  <strong>{x.name}</strong>
                </span>
                <span className="right">
                  <Delta value={x.dpsB - x.dpsA} format={fmt} />
                </span>
              </div>
              <div className="paired">
                <span className="pair-label muted small">A</span>
                <div className="bar" aria-hidden="true">
                  <span className="slot-other" style={{ width: pct(x.dpsA / max) }} />
                </div>
                <span className="num small">{fmt(x.dpsA)}</span>
                <span className="pair-label muted small">B</span>
                <div className="bar" aria-hidden="true">
                  <span className={slotClass(x.slotA)} style={{ width: pct(x.dpsB / max) }} />
                </div>
                <span className="num small">{fmt(x.dpsB)}</span>
              </div>
              <div className="muted small">
                Share {pct(x.shareA)} → {pct(x.shareB)} · on field {secs(x.fieldA)} → {secs(x.fieldB)}
                {x.energyA !== undefined && x.energyB !== undefined ? ` · energy left ${fmt(x.energyA)} → ${fmt(x.energyB)}` : ''}
              </div>
            </li>
          ))}
        </ul>
        <p className="muted small">Grey bars are Scenario A, coloured bars Scenario B.</p>
      </section>
      {c.sources.length > 0 && (
        <section className="card">
          <h2>Biggest damage changes</h2>
          <p className="muted small">Attacks whose DPS changed the most from A to B.</p>
          <table className="table">
            <tbody>
              {sources.map((s) => (
                <tr key={`${s.character}|${s.source}`}>
                  <td>
                    <span className={`swatch ${slotClass(s.slot)}`} aria-hidden="true" />
                    {s.source}
                    <div className="muted small">
                      {s.character} · {fmt(s.a)} → {fmt(s.b)}
                    </div>
                  </td>
                  <td className="num">
                    <Delta value={s.diff} format={fmt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.sources.length > 10 && (
            <button className="secondary small-button" onClick={() => setAllSources(!allSources)}>
              {allSources ? 'Show top 10' : `Show all ${c.sources.length}`}
            </button>
          )}
        </section>
      )}
    </>
  );
}

function DifferentTeams({ c }: { c: Comparison }) {
  const side = (label: string, view: Comparison['viewA']) => {
    const parts: Part[] = view.characters.map((x) => ({
      label: x.name,
      slot: x.slot,
      value: x.dps.mean,
      inside: `${Math.round(x.share * 100)}%`,
      detail: `${fmt(x.dps.mean)} DPS (${pct(x.share)})`,
    }));
    return (
      <div className="team-side">
        <p className="bar-title">
          {label}: {fmt(view.teamDps.mean)} DPS
        </p>
        <SegmentedBar parts={parts} label={`${label} share of team damage`} />
        <Legend items={view.characters.map((x) => ({ label: x.name, slot: x.slot }))} />
        <ul className="char-list">
          {view.characters.map((x) => (
            <li key={x.key}>
              <div className="char-line">
                <span>
                  <span className={`swatch ${slotClass(x.slot)}`} aria-hidden="true" />
                  {x.name}
                </span>
                <span className="right">{fmt(x.dps.mean)}</span>
              </div>
              <div className="muted small">
                {pct(x.share)} of damage · {secs(x.fieldTime.mean)} on field
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <section className="card">
      <h2>Who does the damage</h2>
      <p className="muted small">Different teams, so each is shown on its own. Colours follow each team's own slots.</p>
      <div className="team-sides">
        {side('Scenario A', c.viewA)}
        {side('Scenario B', c.viewB)}
      </div>
    </section>
  );
}
