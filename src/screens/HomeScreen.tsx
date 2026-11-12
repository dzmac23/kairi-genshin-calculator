import { useEffect, useState } from 'react';
import { engineUrl } from '../engine/pool';

type EngineVersion = { gcsimTag: string; gcsimCommit: string; goVersion: string };

export default function HomeScreen({ onStart }: { onStart: () => void }) {
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
    </>
  );
}
