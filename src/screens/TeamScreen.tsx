import { useEffect, useMemo, useState } from 'react';
import Picker, { type PickerOption } from '../components/Picker';
import { useGameData, type GameData, type LevelKey } from '../data/gameData';
import { checkTeam, teamToGcsim } from '../team/gcsim';
import { ARTIFACT_STATS, CHARACTER_LEVELS, emptySlot, WEAPON_LEVELS, type Slot, type Team } from '../team/model';
import { computeStats } from '../team/stats';

type Props = { team: Team; onChange: (team: Team) => void };

const TALENT_NAMES = ['Normal Attack', 'Elemental Skill', 'Elemental Burst'];

export default function TeamScreen({ team, onChange }: Props) {
  const data = useGameData();
  const [active, setActive] = useState(0);

  if (!data) {
    return (
      <section className="card">
        <h2>Team</h2>
        <p className="muted">Loading game data…</p>
      </section>
    );
  }

  const updateSlot = (i: number, slot: Slot) => onChange(team.map((s, j) => (j === i ? slot : s)));
  const problems = checkTeam(team, data);

  return (
    <>
      <section className="card">
        <h2>Team</h2>
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

      <SlotEditor key={active} index={active} slot={team[active]} data={data} onChange={(s) => updateSlot(active, s)} />

      <TeamSummary team={team} data={data} problems={problems} />
    </>
  );
}

function SlotEditor({ index, slot, data, onChange }: { index: number; slot: Slot; data: GameData; onChange: (s: Slot) => void }) {
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
            <LevelSelect label="Level" value={slot.level} levels={CHARACTER_LEVELS} onChange={(level) => set({ level })} />
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
              <LevelSelect label="Weapon level" value={slot.weaponLevel} levels={WEAPON_LEVELS} onChange={(weaponLevel) => set({ weaponLevel })} />
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

          <h3>Artifact stats</h3>
          <p className="muted small">
            Totals across all five artifacts, main stats and substats added together. Type percentages as shown in game
            (33.1 for 33.1%). Leave a box empty for 0.
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
    </section>
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

function TeamSummary({ team, data, problems }: { team: Team; data: GameData; problems: ReturnType<typeof checkTeam> }) {
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
        <p>Ready for gcsim. The Rotation screen (next step) will add the rotation and fight settings.</p>
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

function LevelSelect({ label, value, levels, onChange }: { label: string; value: LevelKey; levels: LevelKey[]; onChange: (v: LevelKey) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as LevelKey)}>
        {levels.map((l) => (
          <option key={l} value={l}>
            {l.endsWith('+') ? `${l.slice(0, -1)} (ascended)` : l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  values,
  onChange,
  prefix = '',
  names,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
  prefix?: string;
  names?: Partial<Record<T, string>>;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {values.map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? 'selected' : ''} onClick={() => onChange(v)}>
            {names?.[v] ?? `${prefix}${v}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A number box that lets you type freely ("33." or "") and stores a number or nothing. */
function NumberField({ label, value, suffix, onChange }: { label: string; value: number | undefined; suffix: string; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (value !== (text.trim() === '' ? undefined : Number(text.replace(',', '.')))) setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <label className="number-field">
      <span className="small">{label}</span>
      <span className="number-input">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const n = Number(t.replace(',', '.'));
            if (t.trim() === '') onChange(undefined);
            else if (Number.isFinite(n)) onChange(n);
          }}
          aria-label={label}
        />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </label>
  );
}
