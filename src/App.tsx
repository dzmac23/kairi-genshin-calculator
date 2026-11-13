import { useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { buildConfig, teamMembers } from './config/build';
import { cleanSettings, DEFAULT_SETTINGS } from './config/settings';
import { useGameData } from './data/gameData';
import { getEngineVersion } from './engine/version';
import { runName, type RunRecord } from './history/model';
import { useHistory } from './history/useHistory';
import type { RotationText } from './rotation/notation';
import { DEFAULT_TOKEN_TABLE, OLD_DEFAULT_TOKEN_TABLES, parseTokenTable } from './rotation/tokens';
import HistoryScreen from './screens/HistoryScreen';
import HomeScreen from './screens/HomeScreen';
import RotationScreen from './screens/RotationScreen';
import ResultsScreen from './screens/ResultsScreen';
import RunScreen, { type RunSource } from './screens/RunScreen';
import TeamScreen from './screens/TeamScreen';
import { useTeam } from './team/useTeam';
import { usePersistentState } from './usePersistentState';
import { useSimulation, type FinishedRun } from './useSimulation';

const screens = ['Home', 'Team', 'Rotation', 'Run', 'Results', 'History'] as const;
type Screen = (typeof screens)[number];

/** A saved run as the Results screen shows it. */
function recordToRun(r: RunRecord): FinishedRun {
  return {
    id: r.id,
    meta: { source: r.source, label: r.label, team: r.team, rotation: r.rotation, settings: r.settings },
    result: r.result,
    seconds: r.seconds,
    finishedAt: new Date(r.createdAt),
    config: r.config,
    notes: r.notes,
    timing: r.timing,
  };
}

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

  // Run history: every successful run is saved on this device, and updated when its rotation
  // timing has been measured.
  const history = useHistory();
  const [runLabel, setRunLabel] = useState('');
  const [iterations, setIterations] = usePersistentState('iterations', 500, (v) => ([100, 500, 1000].includes(v as number) ? (v as number) : undefined));
  const [viewedRunId, setViewedRunId] = useState<string | undefined>();
  const seenRun = useRef<string | undefined>(undefined);
  useEffect(() => {
    const r = simulation.lastRun;
    if (!r) return;
    if (seenRun.current !== r.id) {
      // A new run finished: show it, and clear the label box for the next one.
      seenRun.current = r.id;
      setViewedRunId(undefined);
      setRunLabel('');
    }
    let cancelled = false;
    getEngineVersion().then((v) => {
      if (cancelled) return;
      history.save({
        id: r.id,
        createdAt: r.finishedAt.toISOString(),
        label: r.meta.label?.trim() || undefined,
        origin: 'local',
        gcsimVersion: v?.gcsimTag,
        source: r.meta.source,
        team: r.meta.team,
        rotation: r.meta.rotation,
        settings: r.meta.settings,
        config: r.config,
        notes: r.notes,
        seconds: r.seconds,
        result: r.result,
        timing: typeof r.timing === 'object' ? r.timing : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [simulation.lastRun]);
  // Results shows the run opened from History, else the latest run of this session, else (after
  // reopening the app) the most recent saved run.
  const viewed = viewedRunId
    ? history.runs.find((r) => r.id === viewedRunId)
    : simulation.lastRun
      ? undefined
      : history.runs[0];
  const shownRun = viewed ? recordToRun(viewed) : simulation.lastRun;
  const shownRecord = shownRun ? history.runs.find((r) => r.id === shownRun.id) : undefined;

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
            label={runLabel}
            onLabelChange={setRunLabel}
            iterations={iterations}
            onIterationsChange={setIterations}
            onRun={(runConfig, notes) =>
              simulation.run(
                runConfig,
                notes,
                // Rotation timing needs the turn markers, so only Team + Rotation runs get it.
                source === 'team' && built?.timingConfig
                  ? { config: built.timingConfig, turns: built.translation.turns, durationSeconds: cleanSettings(settings).duration }
                  : undefined,
                // Saved with the run in the History.
                source === 'team'
                  ? { source, label: runLabel, team: structuredClone(team), rotation: { ...rotation }, settings: cleanSettings(settings) }
                  : { source, label: runLabel },
              )
            }
            onCancel={simulation.cancel}
            onShowResults={() => setScreen('Results')}
          />
        )}
        {screen === 'Results' && (
          <ResultsScreen
            run={shownRun}
            name={shownRecord ? runName(shownRecord) : undefined}
            olderRun={!!viewed && viewed.id !== simulation.lastRun?.id}
            onShowLatest={simulation.lastRun ? () => setViewedRunId(undefined) : undefined}
            onRename={shownRecord ? (label) => history.rename(shownRecord.id, label) : undefined}
            label={shownRecord?.label}
            onGoToRun={() => setScreen('Run')}
          />
        )}
        {screen === 'History' && (
          <HistoryScreen
            runs={history.runs}
            loaded={history.loaded}
            onOpen={(id) => {
              setViewedRunId(id);
              setScreen('Results');
            }}
            onRename={history.rename}
            onDelete={(ids) => {
              history.remove(ids);
              if (viewedRunId && ids.includes(viewedRunId)) setViewedRunId(undefined);
            }}
            onImport={history.importRuns}
            onLoad={(r) => {
              if (r.team) setTeam(structuredClone(r.team));
              if (r.rotation) setRotation({ ...r.rotation });
              if (r.settings) setSettings(cleanSettings(r.settings));
              setSource('team');
              setScreen('Rotation');
            }}
          />
        )}
      </main>

    </div>
  );
}
