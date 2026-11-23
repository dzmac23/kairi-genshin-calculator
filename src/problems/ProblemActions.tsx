// Copy / Save / Share for one problem report, and the Home screen's list of recent problems.

import { useState } from 'react';
import { canShareFiles, copyText, deliverText } from '../history/files';
import { clearProblems, problemReport, removeProblem, reportFileName, useProblems, type Problem } from './log';

export function ProblemActions({ id }: { id?: string }) {
  const problems = useProblems();
  const problem = problems.find((p) => p.id === id);
  if (!problem) return null;
  return <ReportButtons problem={problem} />;
}

function ReportButtons({ problem }: { problem: Problem }) {
  const [withSetup, setWithSetup] = useState(true);
  const [message, setMessage] = useState('');
  const text = () => problemReport(problem, withSetup);
  return (
    <div className="problem-actions">
      <div className="button-row">
        <button className="secondary small-button" onClick={async () => setMessage((await copyText(text())) ? 'Report copied: paste it in a message.' : "Couldn't copy: use Save instead.")}>
          Copy report
        </button>
        <button className="secondary small-button" onClick={async () => setMessage(await deliverText(reportFileName(problem), text(), false))}>
          Save report
        </button>
        {canShareFiles() && (
          <button className="secondary small-button" onClick={async () => setMessage(await deliverText(reportFileName(problem), text(), true))}>
            Share report
          </button>
        )}
      </div>
      {problem.setup && (
        <label className="toggle small">
          <input type="checkbox" checked={withSetup} onChange={(e) => setWithSetup(e.target.checked)} />
          <span>Include my team, rotation and fight settings (helps find the cause)</span>
        </label>
      )}
      {message && <p className="small muted">{message}</p>}
    </div>
  );
}

const WHEN = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Home: recent problems, each with its report buttons. */
export function ProblemReports() {
  const problems = useProblems();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>Problem reports</h2>
      <p className="muted small">
        When something goes wrong (a run stops, a screen crashes), the app keeps a report here, on this device only.
        Copy or save one to send it along; nothing is sent by itself.
      </p>
      {problems.length === 0 ? (
        <p className="small muted">No problems recorded.</p>
      ) : (
        <>
          <ul className="problem-list">
            {problems.map((p) => (
              <li key={p.id}>
                <button className="link problem-summary" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  <span className="muted small">{WHEN(p.time)} · {p.where}</span>
                  <span className="problem-message">{p.message}</span>
                </button>
                {open === p.id && (
                  <div className="problem-body">
                    {p.diagnosis && <p className="small"><strong>Automatic check:</strong> {p.diagnosis}</p>}
                    <ReportButtons problem={p} />
                    <button className="link small danger-text" onClick={() => removeProblem(p.id)}>
                      Delete this report
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button className="link small" onClick={() => clearProblems()}>
            Clear all
          </button>
        </>
      )}
    </section>
  );
}
