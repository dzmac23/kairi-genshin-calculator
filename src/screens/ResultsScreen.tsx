import { useMemo, useState } from 'react';
import { summarize, type GcsimResult, type Stat } from '../results/summarize';
import { isPlaceholderConfig, PLACEHOLDER_LABEL, PLACEHOLDER_NOTE } from '../placeholder';
import type { FinishedRun } from '../useSimulation';

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const secs = (n: number) => `${n.toFixed(1)} s`;
const range = (s: Stat, f: (n: number) => string) => `${f(s.min)} – ${f(s.max)}`;

const SOURCES_SHOWN = 10;

export default function ResultsScreen({ run, onGoToRun }: { run?: FinishedRun; onGoToRun: () => void }) {
  const view = useMemo(() => (run ? summarize(run.result as GcsimResult) : undefined), [run]);
  const [showAllSources, setShowAllSources] = useState(false);

  if (!run || !view) {
    return (
      <section className="card">
        <h2>Results</h2>
        <p className="muted">No results yet. Run a simulation and the full breakdown will appear here.</p>
        <button onClick={onGoToRun}>Go to Run</button>
      </section>
    );
  }

  const sources = showAllSources ? view.sources : view.sources.slice(0, SOURCES_SHOWN);
  const maxSource = view.sources[0]?.dps ?? 1;

  return (
    <>
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

      <section className="card">
        <h2>Team DPS</h2>
        <p className="big">{fmt(view.teamDps.mean)}</p>
        <dl className="stats">
          <dt>Standard deviation</dt>
          <dd>{fmt(view.teamDps.sd)}</dd>
          <dt>Lowest – highest</dt>
          <dd>{range(view.teamDps, fmt)}</dd>
          <dt>Iterations</dt>
          <dd>{view.iterations}</dd>
          <dt>Fight length</dt>
          <dd>{secs(view.duration)}</dd>
        </dl>
        <p className="muted small">
          Finished {run.finishedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} in{' '}
          {run.seconds.toFixed(1)} s.
        </p>
      </section>

      {view.warnings.length > 0 && (
        <section className="card warnings">
          <h2>Warnings from gcsim</h2>
          {view.warnings.map((w) => (
            <div className="callout" key={w.kind}>
              <strong>{w.title}</strong>
              <p className="small">{w.advice}</p>
              {w.rows.length > 0 && (
                <ul className="small">
                  {w.rows.map((r) => (
                    <li key={r.character}>
                      {r.character} waited <strong>{secs(r.seconds.mean)}</strong> per fight on average (up to{' '}
                      {secs(r.seconds.max)}).
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Characters</h2>
        <div className="characters">
          {view.characters.map((c) => (
            <div className="character" key={c.key}>
              <div className="character-head">
                <span className={`element el-${c.element}`} aria-hidden="true" />
                <strong>{c.name}</strong>
                <span className="right">{fmt(c.dps.mean)} DPS</span>
              </div>
              <div className="bar" aria-hidden="true">
                <span className={`el-${c.element}`} style={{ width: pct(Math.max(0, c.share)) }} />
              </div>
              <dl className="stats compact">
                <dt>Share of team DPS</dt>
                <dd>{pct(c.share)}</dd>
                <dt>DPS standard deviation</dt>
                <dd>{fmt(c.dps.sd)}</dd>
                <dt>Time on field</dt>
                <dd>
                  {secs(c.fieldTime.mean)} ({pct(c.fieldShare)})
                </dd>
                {c.endingEnergy && (
                  <>
                    <dt>Energy left at the end</dt>
                    <dd>{fmt(c.endingEnergy.mean)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Damage by source</h2>
        <p className="muted small">Every attack, highest first, as DPS and share of the team total.</p>
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
                <span className={`el-${s.element}`} style={{ width: pct(s.dps / maxSource) }} />
              </div>
            </li>
          ))}
        </ol>
        {view.sources.length > SOURCES_SHOWN && (
          <button className="secondary" onClick={() => setShowAllSources(!showAllSources)}>
            {showAllSources ? 'Show top 10' : `Show all ${view.sources.length}`}
          </button>
        )}
      </section>

      <section className="card">
        <h2>Reactions</h2>
        {view.reactions.length === 0 ? (
          <p className="muted">No reactions in this run.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reaction</th>
                <th>Triggered by</th>
                <th className="num">Per fight</th>
              </tr>
            </thead>
            <tbody>
              {view.reactions.map((r) => (
                <tr key={`${r.reaction}|${r.character}`}>
                  <td>{r.reaction}</td>
                  <td>{r.character}</td>
                  <td className="num">{r.perFight.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Time lost to failed actions</h2>
        <p className="muted small">
          Time a character stood idle because the rotation asked for something that wasn't ready yet. gcsim shows a
          warning above when it is 1 second or more.
        </p>
        {view.timeLost.length === 0 ? (
          <p>No time lost. The rotation runs without waiting.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Character</th>
                <th>Reason</th>
                <th className="num">Average</th>
                <th className="num">Worst</th>
              </tr>
            </thead>
            <tbody>
              {view.timeLost.map((r) => (
                <tr key={`${r.character}|${r.kind}`}>
                  <td>{r.character}</td>
                  <td>{r.label}</td>
                  <td className="num">{secs(r.seconds.mean)}</td>
                  <td className="num">{secs(r.seconds.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
