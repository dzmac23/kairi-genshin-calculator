import { useEffect, useState } from 'react';
import { getEngineVersion, type EngineVersion } from '../engine/version';
import { canShareFiles } from '../history/files';

export type HomeTarget = 'Setup' | 'Run' | 'Results' | 'Compare' | 'History';

type Props = {
  onGo: (screen: HomeTarget) => void;
  /** Exports everything (runs, saved teams, current setup) as one backup file. */
  onBackup: (share: boolean) => void;
  onImportFile: (file: File) => void;
  backupMessage?: string;
  counts: { runs: number; teams: number };
};

const STEPS: { screen: HomeTarget; title: string; text: string }[] = [
  { screen: 'Setup', title: 'Set up the team and rotation', text: 'Pick four characters, their weapons, artifact sets and stats, then type the rotation the community way (Furina E D Q > Skirk tE N5 Q …). Save the team: its first rotation becomes its main one.' },
  { screen: 'Run', title: 'Run it', text: 'Switch team or rotation in one tap, set the fight (enemy, optional HP for time to kill, energy), and run 100, 500 or 1,000 fights.' },
  { screen: 'Results', title: 'Read the results', text: 'Team DPS, who does the damage, time lost waiting, rotation timing, damage over the fight, energy.' },
  { screen: 'Compare', title: 'Compare', text: 'Change one thing, run again, and see whether it is really better or just luck.' },
];

export default function HomeScreen({ onGo, onBackup, onImportFile, backupMessage, counts }: Props) {
  const sharing = canShareFiles();
  const [version, setVersion] = useState<EngineVersion | 'missing' | null>(null);

  useEffect(() => {
    getEngineVersion().then((v) => setVersion(v ?? 'missing'));
  }, []);

  return (
    <>
      <section className="card">
        <h2>Welcome</h2>
        <p>
          Kairi Calc runs real gcsim simulations of your Genshin Impact teams on this device, even offline. Nothing is
          uploaded: your teams and results stay here.
        </p>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.screen}>
              <span className="step-num">{i + 1}</span>
              <div>
                <button className="link step-title" onClick={() => onGo(s.screen)}>
                  {s.title}
                </button>
                <p className="small muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="small muted">
          Every run is saved in{' '}
          <button className="link small" onClick={() => onGo('History')}>
            History
          </button>{' '}
          ({counts.runs} so far), where you can reopen, rename, export or import runs.
        </p>
      </section>

      <section className="card">
        <h2>Backup &amp; restore</h2>
        <p className="muted small">
          A backup file holds everything: {counts.runs} saved runs, {counts.teams} saved teams, and your current team,
          rotation, fight settings and shorthand table. Import it on another device to move everything across, or keep it
          somewhere safe.
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
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportFile(file);
                e.target.value = ''; // so choosing the same file again still works
              }}
            />
          </label>
        </div>
        {backupMessage && <p className="small muted">{backupMessage}</p>}
      </section>

      <section className="card">
        <h2>Engine</h2>
        {version === null && <p className="muted">Looking for the gcsim engine…</p>}
        {version === 'missing' && (
          <p className="warn">
            The gcsim engine is not in this build. Run <code>npm run engine</code> locally, or use the version published by
            GitHub Actions.
          </p>
        )}
        {version && version !== 'missing' && (
          <p className="muted small">
            gcsim {version.gcsimTag} ({version.gcsimCommit.slice(0, 7)}), built with {version.goVersion}. Characters gcsim
            doesn't support yet are marked on the Setup screen.
          </p>
        )}
      </section>
    </>
  );
}
