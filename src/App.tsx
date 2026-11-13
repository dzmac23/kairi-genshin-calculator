import { useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { buildConfig, teamMembers } from './config/build';
import { cleanSettings, DEFAULT_SETTINGS } from './config/settings';
import { useGameData } from './data/gameData';
import type { RotationText } from './rotation/notation';
import { DEFAULT_TOKEN_TABLE, OLD_DEFAULT_TOKEN_TABLES, parseTokenTable } from './rotation/tokens';
import HomeScreen from './screens/HomeScreen';
import RotationScreen from './screens/RotationScreen';
import ResultsScreen from './screens/ResultsScreen';
import RunScreen, { type RunSource } from './screens/RunScreen';
import TeamScreen from './screens/TeamScreen';
import { useTeam } from './team/useTeam';
import { usePersistentState } from './usePersistentState';
import { useSimulation } from './useSimulation';

const screens = ['Home', 'Team', 'Rotation', 'Run', 'Results', 'History'] as const;
type Screen = (typeof screens)[number];

const comingSoon: Partial<Record<Screen, string>> = {
  History: 'Every run saved on this device, with export and import.',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');
  // Kept here, above the screens, so a run keeps going when you switch tabs.
  const simulation = useSimulation();
  // A pasted gcsim config for the Run screen. Starts empty: no team is loaded by default.
  const [config, setConfig] = useState('');
  const [source, setSource] = useState<RunSource>('team');
  // The team, rotation, fight settings and shorthand table, all saved on this device.
  const { team, setTeam } = useTeam();
  const [rotation, setRotation] = usePersistentState<RotationText>('rotation', { opener: '', loop: '' }, (v) => {
    if (typeof v === 'string') return { opener: '', loop: v }; // saved by Step 5, before the Opener existed
    const r = v as Partial<RotationText> | undefined;
    return r && typeof r === 'object' ? { opener: String(r.opener ?? ''), loop: String(r.loop ?? '') } : undefined;
  });
  const [settings, setSettings] = usePersistentState('settings', DEFAULT_SETTINGS, (v) => cleanSettings(v ?? {}));
  const [tokenTable, setTokenTable] = usePersistentState('tokenTable', DEFAULT_TOKEN_TABLE, (v) =>
    // An unedited copy of an older built-in table is upgraded (e.g. to add W = walk).
    typeof v === 'string' ? (OLD_DEFAULT_TOKEN_TABLES.includes(v) ? DEFAULT_TOKEN_TABLE : v) : undefined,
  );
  const data = useGameData();
  const parsedTable = useMemo(() => parseTokenTable(tokenTable), [tokenTable]);
  // The config built from the Team and Rotation screens (iterations are set on the Run screen).
  const built = useMemo(
    () => (data ? buildConfig(team, data, rotation, parsedTable, cleanSettings(settings), 500) : undefined),
    [data, team, rotation, parsedTable, settings],
  );
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
        {screen === 'Team' && <TeamScreen team={team} onChange={setTeam} onGoToRotation={() => setScreen('Rotation')} />}
        {screen === 'Rotation' && (
          <RotationScreen
            rotation={rotation}
            onRotationChange={setRotation}
            settings={settings}
            onSettingsChange={setSettings}
            tokenTable={tokenTable}
            onTokenTableChange={setTokenTable}
            members={data ? teamMembers(team, data) : []}
            built={built}
            onGoToRun={() => setScreen('Run')}
            onGoToTeam={() => setScreen('Team')}
          />
        )}
        {screen === 'Run' && (
          <RunScreen
            state={simulation.state}
            source={source}
            onSourceChange={setSource}
            built={built}
            onGoTo={setScreen}
            config={config}
            onConfigChange={setConfig}
            onRun={(runConfig, notes) =>
              simulation.run(
                runConfig,
                notes,
                // Rotation timing needs the turn markers, so only Team + Rotation runs get it.
                source === 'team' && built?.timingConfig
                  ? { config: built.timingConfig, turns: built.translation.turns, durationSeconds: cleanSettings(settings).duration }
                  : undefined,
              )
            }
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
