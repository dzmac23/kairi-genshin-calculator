import { canShareFiles } from '../history/files';
import { useEffect, useState } from 'react';
import { engineUrl } from '../engine/pool';

type EngineVersion = { gcsimTag: string; gcsimCommit: string; goVersion: string };

type Props = {
  onStart: () => void;
  /** Exports everything (runs, saved teams, current setup) as one backup file. */
  onBackup: (share: boolean) => void;
  onImportFile: (file: File) => void;
  backupMessage?: string;
  counts: { runs: number; teams: number };
};

export default function HomeScreen({ onStart, onBackup, onImportFile, backupMessage, counts }: Props) {
  const sharing = canShareFiles();
  const [version, setVersion] = useState<EngineVersion | 'missing' | null>(null);

  useEffect(() => {
    fetch(`${engineUrl}version.json`)
      .then((r) => (r.ok ? r.json() : 'missing'))
      .then(setVersion)
      .catch(() => setVersion('missing'));
  }, []);

  return (
    <>
      <section className="card">
        <h2>Welcome</h2>
        <p>
          This app runs real gcsim simulations on your device, even offline. It is being built step by step: the
          Run screen works now, and the other tabs are placeholders.
        </p>
        <button onClick={onStart}>Go to Run</button>
      </section>
      <section className="card">
        <h2>Engine</h2>
        {version === null && <p className="muted">Looking for the gcsim engine…</p>}
        {version === 'missing' && (
          <p className="warn">
            The gcsim engine is not in this build. Run <code>npm run engine</code> locally, or use the version
            published by GitHub Actions.
          </p>
        )}
        {version && version !== 'missing' && (
          <p className="muted">
            gcsim {version.gcsimTag} ({version.gcsimCommit.slice(0, 7)}), built with {version.goVersion}
          </p>
        )}
      </section>
      <section className="card">
        <h2>Backup &amp; restore</h2>
        <p className="muted small">
          Your data stays on this device. A backup file holds everything: {counts.runs} saved runs, {counts.teams} saved
          teams, and your current team, rotation, fight settings and shorthand table. Import it on another device to move
          everything across, or keep it somewhere safe.
        </p>
        <div className="button-row">
          <button className="secondary" onClick={() => onBackup(false)}>
            Export everything
          </button>
          {sharing && (
            <button className="secondary" onClick={() => onBackup(true)}>
              Share backup
            </button>
          )}
          <label className="secondary file-button">
            Import file…
            <input type="file" accept=".json,application/json" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.target.value = ''; // so choosing the same file again still works
            }} />
          </label>
        </div>
        {backupMessage && <p className="small muted">{backupMessage}</p>}
      </section>
    </>
  );
}
