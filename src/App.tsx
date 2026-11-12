import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import HomeScreen from './screens/HomeScreen';
import RunScreen from './screens/RunScreen';
import { useSimulation } from './useSimulation';

const screens = ['Home', 'Team', 'Rotation', 'Run', 'Results', 'History'] as const;
type Screen = (typeof screens)[number];

const comingSoon: Partial<Record<Screen, string>> = {
  Team: 'Four slots with character, weapon, artifact pickers and stat totals.',
  Rotation: 'Community rotation notation with a live gcsim translation preview.',
  Results: 'Team DPS, per-character breakdown, damage sources, reactions and warnings.',
  History: 'Every run saved on this device, with export and import.',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');
  // Kept here, above the screens, so a run keeps going when you switch tabs.
  const simulation = useSimulation();
  const running = simulation.state.phase === 'starting' || simulation.state.phase === 'running';

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
          {running ? 'A new version is ready. Update after this run.' : 'A new version is ready.'}
          <button onClick={() => updateServiceWorker(true)} disabled={running}>
            Update
          </button>
        </div>
      )}
      {offlineReady && (
        <div className="banner">
          Saved for offline use.
          <button onClick={() => setOfflineReady(false)}>OK</button>
        </div>
      )}

      <main className="content">
        {screen === 'Home' && <HomeScreen onStart={() => setScreen('Run')} />}
        {screen === 'Run' && (
          <RunScreen state={simulation.state} onRun={simulation.run} onCancel={simulation.cancel} />
        )}
        {comingSoon[screen] && (
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
            {s === 'Run' && running && <span className="dot" aria-label="running" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
