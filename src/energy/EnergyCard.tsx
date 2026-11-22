// The Energy Recharge targets card on the Setup screen. As soon as a team is picked it shows rough
// targets from a stand-in rotation (everyone uses skill then burst, 20 s per rotation); once the
// rotation is written, the targets are for that rotation. They update by themselves as the team,
// builds, rotation or fight settings change (a moment after the last change).

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildConfig, teamMembers } from '../config/build';
import type { SimSettings } from '../config/settings';
import type { GameData } from '../data/gameData';
import { energyFights } from '../engine/pool';
import type { TokenTable } from '../rotation/tokens';
import type { Team } from '../team/model';
import { usePersistentState } from '../usePersistentState';
import { ENERGY_FIGHTS, ENERGY_LEVELS, energyTargets, standInRotation, type CharacterEnergy, type EnergyFight, type EnergyLevel } from './energy';

type Props = {
  team: Team;
  data: GameData;
  table: TokenTable;
  settings: SimSettings;
  /** The real rotation's config, when it builds without problems. */
  rotationConfig?: string;
};

/** Per character (gcsim key): how many written bursts one real burst covers, or 0 = doesn't need to burst. */
type Options = { level: EnergyLevel; every: Record<string, number> };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const WAIT_MS = 700;

export default function EnergyCard({ team, data, table, settings, rotationConfig }: Props) {
  const [options, setOptions] = usePersistentState<Options>('energyOptions', { level: 'average', every: {} }, (v) =>
    v && typeof v === 'object' ? { level: 'average', every: {}, ...(v as Partial<Options>) } : undefined,
  );
  const members = teamMembers(team, data).filter((m) => m.key);

  // The config to measure: the real rotation, or the stand-in one before it's written.
  const job = useMemo(() => {
    if (rotationConfig) return { config: rotationConfig, rough: false, problem: undefined };
    if (!members.length) return undefined;
    const stand = buildConfig(team, data, standInRotation(members.map((m) => m.name)), table, settings, 1);
    if (!stand.config) return { config: undefined, rough: true, problem: stand.problems[0] };
    return { config: stand.config, rough: true, problem: undefined };
  }, [rotationConfig, team, data, table, settings, members.map((m) => m.name).join('|')]);

  const [fights, setFights] = useState<{ config: string; fights: EnergyFight[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef<string | undefined>(undefined);
  useEffect(() => {
    const config = job?.config;
    latest.current = config;
    if (!config || fights?.config === config) return;
    setBusy(true);
    const timer = setTimeout(() => {
      const seeds = Array.from({ length: ENERGY_FIGHTS }, (_, i) => String(i + 1));
      energyFights(config, seeds)
        .then((out) => {
          if (latest.current !== config) return;
          setFights({ config, fights: out.map((x) => JSON.parse(x) as EnergyFight) });
          setError('');
        })
        .catch((e: unknown) => latest.current === config && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => latest.current === config && setBusy(false));
    }, WAIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.config]);

  const every = Object.fromEntries(Object.entries(options.every).filter(([, n]) => n > 0));
  const targets = useMemo(() => (fights ? energyTargets(fights.fights, every) : []), [fights, JSON.stringify(every)]);
  if (!members.length) return null;

  const nameOf = new Map(members.map((m) => [m.key!, m.name]));
  const stale = !!fights && fights.config !== job?.config;

  return (
    <section className="card energy-card">
      <div className="card-head">
        <h2>Energy Recharge targets</h2>
        {(busy || stale) && <span className="muted small">updating…</span>}
      </div>
      <p className="muted small">
        {job?.rough ? (
          <>
            <strong>Rough</strong>: from a stand-in rotation where everyone uses their skill, then their burst, every 20 s. Write
            your rotation below for real targets.
          </>
        ) : (
          <>From your rotation: the ER each character needs to burst every time it says so, over {ENERGY_FIGHTS} simulated fights.</>
        )}
      </p>
      <div className="segmented energy-levels" role="radiogroup" aria-label="How sure">
        {ENERGY_LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={options.level === l.id} className={options.level === l.id ? 'selected' : ''} onClick={() => setOptions({ ...options, level: l.id })}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="muted small">{ENERGY_LEVELS.find((l) => l.id === options.level)!.text}.</p>

      {job?.problem && <p className="warn small">{job.problem.replace(/^Team slot \d+: /, '')} Energy targets need the team ready to run.</p>}
      {error && <p className="warn small">Couldn't work out energy: {error}</p>}

      <ul className="energy-list">
        {members.map((m) => {
          const t = targets.find((x) => x.key === m.key);
          const skip = options.every[m.key!] === 0;
          return (
            <li key={m.key}>
              <EnergyRow name={m.name} target={t} level={options.level} skip={skip} nameOf={nameOf} />
              {(!t || skip || t.status === 'target' || t.status === 'once') && (
              <label className="small muted energy-every">
                Needs to burst{' '}
                <select
                  value={skip ? 0 : (options.every[m.key!] ?? 1)}
                  onChange={(e) => setOptions({ ...options, every: { ...options.every, [m.key!]: Number(e.target.value) } })}
                  aria-label={`${m.name} needs to burst`}
                >
                  <option value={1}>every time the rotation does</option>
                  <option value={2}>every 2nd burst</option>
                  <option value={3}>every 3rd burst</option>
                  <option value={0}>not needed</option>
                </select>
              </label>
              )}
            </li>
          );
        })}
      </ul>
      <details className="how-to-read">
        <summary>How this works</summary>
        <p className="small muted">
          The app plays the rotation in fights where bursts don't wait for energy, and measures what each character
          receives between bursts: particles from themselves, teammates and enemies (on or off field), Favonius procs, and
          flat energy from constellations and weapons. ER needed = (burst cost − flat energy) ÷ particle energy before ER.
          The first burst is free (everyone starts full). Your ER is what the character has when bursting, with every
          buff. The fight settings on the Run screen (enemies, random energy) count too.
        </p>
      </details>
    </section>
  );
}

function EnergyRow({ name, target, level, skip, nameOf }: { name: string; target?: CharacterEnergy; level: EnergyLevel; skip: boolean; nameOf: Map<string, string> }) {
  if (!target) return <p className="energy-name"><strong>{name}</strong> <span className="muted small">…</span></p>;
  if (skip) return <p className="energy-name"><strong>{name}</strong> <span className="muted small">· no target (doesn't need to burst)</span></p>;
  if (target.status === 'no-burst') return <p className="energy-name"><strong>{name}</strong> <span className="muted small">· doesn't burst in this rotation</span></p>;
  if (target.status === 'no-energy') return <p className="energy-name"><strong>{name}</strong> <span className="muted small">· their burst doesn't use energy</span></p>;
  if (target.status === 'once') return <p className="energy-name"><strong>{name}</strong> <span className="muted small">· bursts only once per fight: too short to measure</span></p>;
  const need = target.needed[level];
  const short = need - target.yours;
  const scale = Math.max(need, target.yours, 1) * 1.1;
  const label = (key: string) => (key === 'drop' ? 'enemies' : (nameOf.get(key) ?? key.replace(/-/g, ' ')));
  return (
    <>
      <p className="energy-name">
        <strong>{name}</strong>{' '}
        <span className={short > 0.005 ? 'energy-verdict short' : 'energy-verdict ok'}>
          {short > 0.005 ? `✖ ${pct(short)} short` : `✔ ${pct(-short)} to spare`}
        </span>
      </p>
      <div className="energy-bar" aria-hidden="true">
        <span className="energy-yours" style={{ width: `${(target.yours / scale) * 100}%` }} />
        <span className="energy-need" style={{ left: `${(need / scale) * 100}%` }} />
      </div>
      <p className="small">
        Needs <strong>{pct(need)}</strong> · has {pct(target.yours)}
        {target.impossible > 0 && <span className="warn"> · in {target.impossible} fights a burst got no particles at all</span>}
      </p>
      <p className="muted small">
        Bursts every {target.interval.toFixed(1)} s{target.every > 1 ? ` (every ${target.every === 2 ? '2nd' : '3rd'} burst counted)` : ''}. Per burst:{' '}
        {target.sources
          .filter((s) => !s.flat)
          .slice(0, 4)
          .map((s) => `${s.amount.toFixed(1)} from ${label(s.source)}`)
          .join(', ') || 'no particles'}
        {target.perBurst.flat > 0.05 && ` + ${target.perBurst.flat.toFixed(1)} flat`} (before ER), for a {Math.round(target.perBurst.cost)}-energy burst.
      </p>
    </>
  );
}
