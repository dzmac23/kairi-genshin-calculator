import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import EngineCheck from './EngineCheck';

const screens = ['Home', 'Team', 'Rotation', 'Run', 'Results', 'History'] as const;
type Screen = (typeof screens)[number];

const comingSoon: Record<Exclude<Screen, 'Home'>, string> = {
  Team: 'Four slots with character, weapon, artifact pickers and stat totals.',
  Rotation: 'Community rotation notation with a live gcsim translation preview.',
  Run: 'Validate and simulate with progress and cancel.',
  Results: 'Team DPS, per-character breakdown, damage sources, reactions and warnings.',
  History: 'Every run saved on this device, with export and import.',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');
  // Shows a button when a new version of the app has been downloaded in the background.
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <div className="app">
      <header className="topbar">
        <h1>Kairi Calc</h1>
      </header>

      {needRefresh && (
        <div className="banner">
          A new version is ready.
          <button onClick={() => updateServiceWorker(true)}>Update</button>
        </div>
      )}
      {offlineReady && (
        <div className="banner">
          Saved for offline use.
          <button onClick={() => setOfflineReady(false)}>OK</button>
        </div>
      )}

      <main className="content">
        {screen === 'Home' ? (
          <>
            <section className="card">
              <h2>Welcome</h2>
              <p>
                This app runs real gcsim simulations on your device. It is being built step by step. The other tabs are placeholders for now.
              </p>
            </section>
            <EngineCheck />
          </>
        ) : (
          <section className="card">
            <h2>{screen}</h2>
            <p className="muted">Coming soon: {comingSoon[screen]}</p>
          </section>
        )}
      </main>

      <nav className="tabs" aria-label="Screens">
        {screens.map((s) => (
          <button key={s} className={s === screen ? 'active' : ''} onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
    </div>
  );
}
