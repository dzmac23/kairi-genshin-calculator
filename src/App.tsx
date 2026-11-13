import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import HomeScreen from './screens/HomeScreen';
import ResultsScreen from './screens/ResultsScreen';
import RunScreen from './screens/RunScreen';
import { useSimulation } from './useSimulation';

const screens = ['Home', 'Team', 'Rotation', 'Run', 'Results', 'History'] as const;
type Screen = (typeof screens)[number];

const comingSoon: Partial<Record<Screen, string>> = {
  Team: 'Four slots with character, weapon, artifact pickers and stat totals.',
  Rotation: 'Community rotation notation with a live gcsim translation preview.',
  History: 'Every run saved on this device, with export and import.',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');
  // Kept here, above the screens, so a run keeps going when you switch tabs.
  const simulation = useSimulation();
  // The config to run. Starts empty: no team is loaded by default.
  const [config, setConfig] = useState('');
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
        <nav className="tabs" aria-label="Screens">
          {screens.map((s) => (
            <button key={s} className={s === screen ? 'active' : ''} onClick={() => setScreen(s)}>
              {s}
              {s === 'Run' && running && <span className="dot" aria-label="running" />}
            </button>
          ))}
        </nav>
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
          <RunScreen
            state={simulation.state}
            config={config}
            onConfigChange={setConfig}
            onRun={simulation.run}
            onCancel={simulation.cancel}
            onShowResults={() => setScreen('Results')}
          />
        )}
        {screen === 'Results' && <ResultsScreen run={simulation.lastRun} onGoToRun={() => setScreen('Run')} />}
        {comingSoon[screen] && (
          <section className="card">
            <h2>{screen}</h2>
            <p className="muted">Coming soon: {comingSoon[screen]}</p>
          </section>
        )}
      </main>

    </div>
  );
}
