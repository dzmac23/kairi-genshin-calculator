import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { NumberField, Segmented } from '../components/Fields';
import Picker, { type PickerOption } from '../components/Picker';
import { useGameData, type GameData } from '../data/gameData';
import { canChooseAscension, levelCap, levelKey, MAX_ASCENSION, parseLevel } from '../team/level';
import { checkTeam, teamToGcsim } from '../team/gcsim';
import { canSnapshot, totalsFromArtifacts } from '../team/baseline';
import {
  ARTIFACT_STATS,
  artifactsFromTotals,
  baselineKey,
  hasCurrentBaseline,
  emptySlot,
  MAX_CHARACTER_LEVEL,
  MAX_WEAPON_LEVEL,
  TOTAL_STATS,
  type Slot,
  type Team,
  type TotalKey,
} from '../team/model';
import { computeStats } from '../team/stats';
import { Confirm } from './SavedTeams';

type Props = {
  team: Team;
  onChange: Dispatch<SetStateAction<Team>>;
  /** gcsim errors while working out stats without artifacts, by build (see team/useBaselines.ts). */
  baselineErrors?: Record<string, string>;
  /** Empties all four slots (and unlinks the saved team). */
  onClear: () => void;
  /** Clearing would lose unsaved work, so ask first. */
  clearNeedsConfirm: boolean;
  /** Saved-team controls shown at the top of the Team section. */
  saveBar?: ReactNode;
};

const TALENT_NAMES = ['Normal Attack', 'Elemental Skill', 'Elemental Burst'];

export default function TeamScreen({ team, onChange, onClear, clearNeedsConfirm, saveBar, baselineErrors = {} }: Props) {
  const data = useGameData();
  const [active, setActive] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!data) {
    return (
      <section className="card">
        <h2>Team</h2>
        <p className="muted">Loading game data…</p>
      </section>
    );
  }

  const updateSlot = (i: number, slot: Slot) => onChange(team.map((s, j) => (j === i ? slot : s)));
  // For changes that arrive later (worked out by gcsim): applied to the slot as it is by then.
  const patchSlot = (i: number, change: (s: Slot) => Slot) => onChange((t) => t.map((s, j) => (j === i ? change(s) : s)));
  const problems = checkTeam(team, data);

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Team</h2>
          {team.some((s) => s.character) && (
            <button className="secondary small-button" onClick={() => (clearNeedsConfirm ? setConfirmClear(true) : onClear())}>
              Clear current team
            </button>
          )}
        </div>
        {confirmClear && (
          <Confirm
            text="Clear all four slots? Your unsaved changes to this team would be lost. The rotation stays."
            yes="Clear team"
            onYes={() => {
              onClear();
              setActive(0);
              setConfirmClear(false);
            }}
            onNo={() => setConfirmClear(false)}
          />
        )}
        {saveBar}
        <p className="muted small">
          Four slots. Pick a slot, then fill in the character, weapon, artifact sets and artifact stats. Everything is
          saved on this device as you go.
        </p>
        <div className="slot-tabs" role="tablist" aria-label="Team slots">
          {team.map((slot, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={active === i}
              className={active === i ? 'slot-tab selected' : 'slot-tab'}
              onClick={() => setActive(i)}
            >
              <span className="muted small">Slot {i + 1}</span>
              <span>{slot.character ?? 'Empty'}</span>
            </button>
          ))}
        </div>
      </section>

      <SlotEditor
        key={active}
        index={active}
        slot={team[active]}
        data={data}
        onChange={(s) => updateSlot(active, s)}
        onPatch={(change) => patchSlot(active, change)}
        baselineError={baselineErrors[baselineKey(team[active])]}
      />

      <TeamSummary team={team} data={data} problems={problems} />
    </>
  );
}

function SlotEditor({
  index,
  slot,
  data,
  onChange,
  onPatch,
  baselineError,
}: {
  index: number;
  slot: Slot;
  data: GameData;
  onChange: (s: Slot) => void;
  onPatch: (change: (s: Slot) => Slot) => void;
  baselineError?: string;
}) {
  const character = slot.character ? data.character.get(slot.character) : undefined;
  const weapon = slot.weapon ? data.weapon.get(slot.weapon) : undefined;
  const set = (patch: Partial<Slot>) => onChange({ ...slot, ...patch });

  const characterOptions: PickerOption[] = useMemo(
    () =>
      data.characters.map((c) => ({
        value: c.name,
        label: c.name,
        hint: `${c.rarity}★ ${c.element} ${c.weapon_type}`,
        warning: c.gcsim_key ? undefined : 'Not in gcsim yet',
      })),
    [data],
  );
  const weaponOptions: PickerOption[] = useMemo(
    () =>
      data.weapons
        .filter((w) => !character || w.type === character.weapon_type)
        .map((w) => ({
          value: w.name,
          label: w.name,
          hint: `${w.rarity}★ ${w.substat ?? 'no substat'}`,
          warning: w.gcsim_key ? undefined : 'Not in gcsim yet',
        })),
    [data, character],
  );
  const setOptions: PickerOption[] = useMemo(() => data.sets.map((s) => ({ value: s.name, label: s.name, hint: s.two_piece })), [data]);

  const pickCharacter = (name: string | null) => {
    const next = name ? data.character.get(name) : undefined;
    const keepWeapon = next && weapon && weapon.type === next.weapon_type;
    set({ character: name, weapon: keepWeapon ? slot.weapon : null });
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Slot {index + 1}</h2>
        {slot.character && (
          <button className="secondary small-button" onClick={() => onChange(emptySlot())}>
            Clear slot
          </button>
        )}
      </div>

      <Picker label="Character" value={slot.character} options={characterOptions} onChange={pickCharacter} allowClear />
      {character && !character.gcsim_key && (
        <p className="warn small">{character.name} is not in gcsim yet. This slot will be skipped in simulations.</p>
      )}

      {character && (
        <>
          <div className="row">
            <LevelInput label="Level" value={slot.level} max={MAX_CHARACTER_LEVEL} onChange={(level) => set({ level })} />
            <Segmented label="Constellation" value={slot.constellation} values={[0, 1, 2, 3, 4, 5, 6]} prefix="C" onChange={(constellation) => set({ constellation })} />
          </div>

          <div className="field">
            <span className="field-label">Talent levels (base, before C3/C5)</span>
            <div className="talents">
              {TALENT_NAMES.map((name, t) => (
                <label key={name} className="talent">
                  <span className="small muted">{name}</span>
                  <select
                    value={slot.talents[t]}
                    onChange={(e) => {
                      const talents = [...slot.talents] as Slot['talents'];
                      talents[t] = Number(e.target.value);
                      set({ talents });
                    }}
                  >
                    {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="muted small">
              C3 adds +3 to {character.c3_boosts}, C5 adds +3 to {character.c5_boosts}. gcsim applies these itself.
            </p>
          </div>

          <h3>Weapon</h3>
          <Picker label={`Weapon (${character.weapon_type.toLowerCase()})`} value={slot.weapon} options={weaponOptions} onChange={(w) => set({ weapon: w })} />
          {weapon && (
            <div className="row">
              <LevelInput label="Weapon level" value={slot.weaponLevel} max={MAX_WEAPON_LEVEL} onChange={(weaponLevel) => set({ weaponLevel })} />
              <Segmented label="Refinement" value={slot.refinement} values={[1, 2, 3, 4, 5]} prefix="R" onChange={(refinement) => set({ refinement })} />
            </div>
          )}

          <h3>Artifact sets</h3>
          <Segmented
            label="Set bonus"
            value={slot.sets.mode}
            values={['4pc', '2+2', 'none'] as const}
            names={{ '4pc': '4-piece', '2+2': '2 + 2', none: 'None' }}
            onChange={(mode) =>
              set({ sets: mode === '4pc' ? { mode, set: null } : mode === '2+2' ? { mode, first: null, second: null } : { mode } })
            }
          />
          {slot.sets.mode === '4pc' && (
            <Picker label="4-piece set" value={slot.sets.set} options={setOptions} onChange={(v) => set({ sets: { mode: '4pc', set: v } })} />
          )}
          {slot.sets.mode === '2+2' && (
            <>
              <Picker label="First 2-piece" value={slot.sets.first} options={setOptions} onChange={(v) => slot.sets.mode === '2+2' && set({ sets: { ...slot.sets, first: v } })} />
              <Picker label="Second 2-piece" value={slot.sets.second} options={setOptions} onChange={(v) => slot.sets.mode === '2+2' && set({ sets: { ...slot.sets, second: v } })} />
            </>
          )}

          <h3>Stats</h3>
          <StatModeSwitch slot={slot} data={data} onChange={onChange} onPatch={onPatch} />
          {slot.statMode === 'totals' ? (
            <TotalsEntry slot={slot} data={data} element={character.element} set={set} error={baselineError} />
          ) : (
            <>
              <p className="muted small">
                Totals across all five artifacts, main stats and substats added together. Type percentages as shown in
                game (33.1 for 33.1%). Leave a box empty for 0.
              </p>
              <div className="stat-grid">
                {ARTIFACT_STATS.map((s) => (
                  <NumberField
                    key={s.key}
                    label={s.key === 'elem%' ? `${character.element} DMG Bonus` : s.label}
                    suffix={s.percent ? '%' : ''}
                    value={slot.artifacts[s.key]}
                    onChange={(v) => set({ artifacts: { ...slot.artifacts, [s.key]: v } })}
                  />
                ))}
              </div>
              <StatTotals slot={slot} data={data} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Artifact stats or character totals. Switching fills the other boxes in when they're empty: to
 * totals, with the totals gcsim works out from the artifact stats; to artifact stats, with what
 * the totals give (all as flat HP/ATK/DEF, which gcsim treats the same as % plus flat).
 */
function StatModeSwitch({ slot, data, onChange, onPatch }: { slot: Slot; data: GameData; onChange: (s: Slot) => void; onPatch: (change: (s: Slot) => Slot) => void }) {
  const mode = slot.statMode ?? 'artifacts';
  const [filling, setFilling] = useState(false);
  const choose = (next: 'artifacts' | 'totals') => {
    if (next === mode) return;
    if (next === 'totals') {
      const emptyTotals = !slot.totals || Object.keys(slot.totals).length === 0;
      const hasArtifacts = Object.values(slot.artifacts).some((v) => v);
      onChange({ ...slot, statMode: 'totals', totals: slot.totals ?? {} });
      if (emptyTotals && hasArtifacts && canSnapshot(slot, data)) {
        setFilling(true);
        totalsFromArtifacts(slot, data)
          .then((totals) => onPatch((s) => (s.statMode === 'totals' && (!s.totals || Object.keys(s.totals).length === 0) ? { ...s, totals } : s)))
          .catch(() => {})
          .finally(() => setFilling(false));
      }
    } else {
      const derived = artifactsFromTotals(slot);
      const emptyArtifacts = !Object.values(slot.artifacts).some((v) => v);
      const artifacts: Slot['artifacts'] =
        emptyArtifacts && derived
          ? Object.fromEntries(Object.entries(derived).map(([k, v]) => [k, Math.round((v ?? 0) * 10) / 10]))
          : slot.artifacts;
      onChange({ ...slot, statMode: 'artifacts', artifacts });
    }
  };
  return (
    <>
      <Segmented
        label="Enter"
        value={mode}
        values={['artifacts', 'totals'] as const}
        names={{ artifacts: 'Artifact stats', totals: 'Character totals' }}
        onChange={choose}
      />
      {filling && <p className="muted small">Filling in the totals from your artifact stats…</p>}
    </>
  );
}

/** Character totals (from the character screen or Hoyolab) and the artifact stats worked out from them. */
function TotalsEntry({
  slot,
  data,
  element,
  set,
  error,
}: {
  slot: Slot;
  data: GameData;
  element: string;
  set: (patch: Partial<Slot>) => void;
  error?: string;
}) {
  const fromArtifacts = artifactsFromTotals(slot);
  const label = (key: TotalKey, l: string) => (key === 'elem%' ? `${element} DMG Bonus` : l);
  const show = (v: number, percent: boolean) => (percent ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString());
  return (
    <>
      <p className="muted small">
        Type the character's total stats as the character screen or Hoyolab shows them (51.0 for 51.0%). gcsim works out
        what this character has without artifacts (level, ascension, weapon, 2-piece set bonuses, passives), and the rest
        counts as artifact stats. Level, constellation, weapon, refinement and sets above must be right. Leave a box empty
        if artifacts add nothing to it.
      </p>
      <div className="stat-grid">
        {TOTAL_STATS.map((s) => (
          <NumberField
            key={s.key}
            label={label(s.key, s.label)}
            suffix={s.percent ? '%' : ''}
            value={slot.totals?.[s.key]}
            onChange={(v) => set({ totals: { ...slot.totals, [s.key]: v } })}
          />
        ))}
      </div>
      {error ? (
        <p className="warn small">gcsim couldn't work out this character's stats without artifacts: {error}</p>
      ) : !canSnapshot(slot, data) ? (
        <p className="muted small">Pick a weapon gcsim supports, and the artifact stats will be worked out from these totals.</p>
      ) : !hasCurrentBaseline(slot) ? (
        <p className="muted small">Working out the stats without artifacts…</p>
      ) : (
        <table className="table totals-table">
          <thead>
            <tr>
              <th>Stat</th>
              <th className="num">Total</th>
              <th className="num">No artifacts</th>
              <th className="num">Artifacts</th>
            </tr>
          </thead>
          <tbody>
            {TOTAL_STATS.map((s) => {
              const total = slot.totals?.[s.key];
              const art = fromArtifacts?.[s.key];
              return (
                <tr key={s.key}>
                  <td>{label(s.key, s.label)}</td>
                  <td className="num">{total === undefined ? <span className="muted">–</span> : show(total, s.percent)}</td>
                  <td className="num muted">{show(slot.baseline!.stats[s.key], s.percent)}</td>
                  <td className={art !== undefined && art < 0 ? 'num warn' : 'num'}>
                    {art === undefined ? <span className="muted">…</span> : total === undefined ? <span className="muted">0</span> : show(art, s.percent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function StatTotals({ slot, data }: { slot: Slot; data: GameData }) {
  const character = data.character.get(slot.character!)!;
  const stats = computeStats(slot, character, slot.weapon ? data.weapon.get(slot.weapon) : undefined);
  const f = (n: number) => Math.round(n).toLocaleString();
  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <div className="totals">
      <h3>Stat totals</h3>
      <dl className="stats compact">
        <dt>HP</dt>
        <dd>{f(stats.hp)}</dd>
        <dt>ATK</dt>
        <dd>{f(stats.atk)}</dd>
        <dt>DEF</dt>
        <dd>{f(stats.def)}</dd>
        <dt>Elemental Mastery</dt>
        <dd>{f(stats.em)}</dd>
        <dt>CRIT Rate</dt>
        <dd>{p(stats.cr)}</dd>
        <dt>CRIT DMG</dt>
        <dd>{p(stats.cd)}</dd>
        <dt>Energy Recharge</dt>
        <dd>{p(stats.er)}</dd>
        <dt>{character.element} DMG Bonus</dt>
        <dd>{p(stats.elem)}</dd>
        {stats.phys > 0 && (
          <>
            <dt>Physical DMG Bonus</dt>
            <dd>{p(stats.phys)}</dd>
          </>
        )}
      </dl>
      <p className="muted small">
        Character, weapon and artifacts only. Weapon passives, artifact set effects, elemental resonance and team buffs
        are not included here; gcsim applies them during the simulation. So these can be lower than the in-game
        character screen.
      </p>
    </div>
  );
}

function TeamSummary({
  team,
  data,
  problems,
}: {
  team: Team;
  data: GameData;
  problems: ReturnType<typeof checkTeam>;
}) {
  const [copied, setCopied] = useState(false);
  const lines = teamToGcsim(team, data);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="card">
      <h2>Team check</h2>
      {problems.length === 0 ? (
        <p>Team ready. Next, write the rotation below.</p>
      ) : (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={i} className={p.blocking ? 'warn' : 'muted'}>
              {p.slot >= 0 ? `Slot ${p.slot + 1}: ` : ''}
              {p.message}
            </li>
          ))}
        </ul>
      )}
      {lines && (
        <details>
          <summary>Show gcsim team lines</summary>
          <pre className="config-preview">{lines}</pre>
          <button className="secondary" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </details>
      )}
    </section>
  );
}

/**
 * A level box with the ascension shown as six stars. The level sets the stars; at 20, 40, 50, 60,
 * 70 and 80 the next star can be tapped to say the character (or weapon) has ascended there,
 * e.g. 80/90 instead of 80/80.
 */
function LevelInput({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  const current = parseLevel(value, max) ?? { level: 90, ascension: 6 };
  const [text, setText] = useState(String(current.level));
  useEffect(() => {
    // Follow outside changes (loading a team), but not while the box already says this level.
    if (Number(text) !== current.level) setText(String(current.level));
  }, [current.level]);
  const typed = Number(text);
  const bad = text.trim() !== '' && !(Number.isInteger(typed) && typed >= 1 && typed <= max);
  const choosable = canChooseAscension(current.level);
  const ascended = choosable && current.ascension > parseLevel(String(current.level))!.ascension;
  const optionalStar = choosable ? parseLevel(String(current.level))!.ascension : -1; // index of the star that can be tapped
  return (
    <div className="field level-field">
      <label className="field-label" htmlFor={`level-${label}`}>
        {label}
      </label>
      <div className="level-row">
        <input
          id={`level-${label}`}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
            setText(t);
            const n = Number(t);
            // A newly typed level starts before ascending; tap the star to change that.
            if (Number.isInteger(n) && n >= 1 && n <= max) onChange(levelKey(n, n === current.level && ascended));
          }}
          aria-label={label}
        />
        <span className="muted">/ {levelCap(current)}</span>
      </div>
      <div className="stars" role="group" aria-label={`${label}: ascension ${current.ascension} of ${MAX_ASCENSION}`}>
        {Array.from({ length: MAX_ASCENSION }, (_, i) => {
          const lit = i < current.ascension;
          const tappable = i === optionalStar;
          return (
            <button
              key={i}
              type="button"
              className={`star${lit ? ' lit' : ''}${tappable ? ' tappable' : ''}`}
              disabled={!tappable}
              aria-pressed={tappable ? ascended : undefined}
              aria-label={tappable ? (ascended ? `Ascended at ${current.level} (tap to undo)` : `Tap if ascended at ${current.level}`) : `Ascension ${i + 1}${lit ? ' done' : ''}`}
              onClick={() => onChange(levelKey(current.level, !ascended))}
            >
              {lit ? '★' : '☆'}
            </button>
          );
        })}
      </div>
      {bad ? (
        <p className="warn small">Type a level from 1 to {max}.</p>
      ) : (
        choosable && (
          <p className="muted small">
            {ascended
              ? `Ascended at ${current.level}: level cap ${levelCap(current)}.`
              : `Tap the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][optionalStar]} star if it has ascended at ${current.level} (${current.level}/${levelCap({ level: current.level, ascension: current.ascension + 1 })}).`}
          </p>
        )
      )}
    </div>
  );
}
