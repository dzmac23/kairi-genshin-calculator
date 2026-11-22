// What the Library shows for one character, weapon or artifact set. Written to be reused by the
// Setup screen's ⓘ panels: each takes optional build values (level, talent levels, constellation,
// refinement) to start from and to highlight what applies.

import { useState } from 'react';
import RichText from '../components/RichText';
import type { ArtifactSet, Character, GameData, Weapon } from '../data/gameData';
import { interpolateStats } from '../team/level';
import { refinedPassive, scalingAt, SCALING_GROUP, type Library } from './library';

const stars = (n: number) => '★'.repeat(n);
/** A stat value as the game shows it: Elemental Mastery flat, everything else as a percentage. */
const statValue = (stat: string, v: number) => (stat === 'Elemental Mastery' ? Math.round(v).toLocaleString() : `${(v * 100).toFixed(1)}%`);
/** Ascension and weapon stat names: "HP" in the data means HP%. */
const statName = (stat: string) => (['HP', 'ATK', 'DEF'].includes(stat) ? `${stat}%` : stat);

function LevelSelect({ levels, value, onChange, label }: { levels: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="inline-select small">
      {label}{' '}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {levels.map((l) => (
          <option key={l} value={l}>
            {l.endsWith('+') ? `${l.slice(0, -1)} (ascended)` : l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GcsimStatus({ item }: { item: { gcsim_key: string | null; gcsim_patch?: string } }) {
  if (!item.gcsim_key) return <span className="badge warn-badge">Not in gcsim yet</span>;
  if (item.gcsim_patch) return <span className="badge gold">Experimental in gcsim</span>;
  return <span className="badge">In gcsim</span>;
}

export function CharacterDetails({
  character,
  data,
  lib,
  build,
}: {
  character: Character;
  data: GameData;
  lib: Library;
  /** The team slot's choices, when shown from the Setup screen. */
  build?: { level?: string; constellation?: number; talents?: number[] };
}) {
  const text = lib.characters[character.name];
  const levels = character.stats.map((s) => s.level);
  const [level, setLevel] = useState(build?.level && levels.includes(build.level as never) ? build.level : levels.includes('90') ? '90' : levels[levels.length - 1]);
  const [talentLevel, setTalentLevel] = useState(build?.talents?.[0] ?? 10);
  const stats = interpolateStats(character.stats, level, ['base_hp', 'base_atk', 'base_def', 'ascension_value_excl_base_crit']);
  const special = character.gcsim_key ? data.special.get(character.gcsim_key) : undefined;
  const scaling = lib.scaling[character.name] ?? {};
  const cons = build?.constellation;

  return (
    <div className="library-details">
      <div className="details-head">
        <h2>{character.name}</h2>
        <p className="muted small">
          <span className="rarity">{stars(character.rarity)}</span> {character.element} · {character.weapon_type}
          {text?.region ? ` · ${text.region}` : ''}
        </p>
        {text?.title && <p className="muted small details-title">{text.title}</p>}
        <GcsimStatus item={character} />
      </div>

      {special && (
        <div className="special-note">
          <p className="small">
            <strong>⚡ Special mechanics:</strong> {special.special}
          </p>
          <p className="small">
            <strong>How to write it:</strong> <code>{special.howTo}</code>
          </p>
        </div>
      )}

      <section className="details-section">
        <div className="details-section-head">
          <h3>Stats</h3>
          <LevelSelect levels={levels} value={level} onChange={setLevel} label="Level" />
        </div>
        {stats && (
          <dl className="stats compact">
            <dt>Base HP</dt>
            <dd>{Math.round(stats.base_hp!).toLocaleString()}</dd>
            <dt>Base ATK</dt>
            <dd>{Math.round(stats.base_atk!).toLocaleString()}</dd>
            <dt>Base DEF</dt>
            <dd>{Math.round(stats.base_def!).toLocaleString()}</dd>
            <dt>{statName(character.ascension_stat)} (ascension)</dt>
            <dd>{stats.ascension_value_excl_base_crit ? `+${statValue(character.ascension_stat, stats.ascension_value_excl_base_crit)}` : '–'}</dd>
          </dl>
        )}
        <p className="muted small">Every character also has 5% CRIT Rate, 50% CRIT DMG and 100% Energy Recharge.</p>
      </section>

      {text && (
        <>
          <section className="details-section">
            <div className="details-section-head">
              <h3>Talents</h3>
              <label className="inline-select small">
                Talent level{' '}
                <select value={talentLevel} onChange={(e) => setTalentLevel(Number(e.target.value))} aria-label="Talent level">
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {text.talents.map((t) => {
              const rows = scaling[SCALING_GROUP[t.kind]] ?? [];
              return (
                <details key={t.kind} className="talent">
                  <summary>
                    <span className="muted small">{t.kind}</span> <strong>{t.name}</strong>
                  </summary>
                  <RichText text={t.text} />
                  {rows.length > 0 && (
                    <table className="table scaling">
                      <caption className="muted small">At talent level {talentLevel}</caption>
                      <tbody>
                        {rows.map((r, i) => {
                          const v = scalingAt(r, talentLevel);
                          return (
                            <tr key={i}>
                              <td>{r.label}</td>
                              <td className="num">
                                {v.text}
                                {!v.exact && <span className="muted small"> (at level 10)</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </details>
              );
            })}
            <p className="muted small">
              C3 adds 3 levels to the {character.c3_boosts}, C5 to the {character.c5_boosts}.
            </p>
          </section>

          <section className="details-section">
            <h3>Passives</h3>
            {text.passives.map((p) => (
              <div key={p.name} className="passive">
                <p>
                  <strong>{p.name}</strong> <span className="badge">{p.unlock === 'Always' ? 'Always on' : `Unlocks at ${p.unlock}`}</span>
                </p>
                <RichText text={p.text} />
              </div>
            ))}
          </section>

          <section className="details-section">
            <h3>Constellations</h3>
            {text.constellations.map((c) => (
              <div key={c.level} className={`constellation${cons !== undefined ? (c.level <= cons ? ' unlocked' : ' locked') : ''}`}>
                <p>
                  <span className="badge cons-badge">C{c.level}</span> <strong>{c.name}</strong>
                  {cons !== undefined && c.level <= cons && <span className="muted small"> · unlocked</span>}
                </p>
                <RichText text={c.text} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export function WeaponDetails({ weapon, lib, build }: { weapon: Weapon; lib: Library; build?: { level?: string; refinement?: number } }) {
  const levels = weapon.stats.map((s) => s.level);
  const [level, setLevel] = useState(build?.level && levels.includes(build.level as never) ? build.level : levels[levels.length - 1]);
  const [refinement, setRefinement] = useState(build?.refinement ?? 1);
  const stats = interpolateStats(weapon.stats, level, ['base_atk', 'substat_value']);
  const passive = refinedPassive(weapon, refinement);
  const description = lib.weapons[weapon.name]?.description;
  return (
    <div className="library-details">
      <div className="details-head">
        <h2>{weapon.name}</h2>
        <p className="muted small">
          <span className="rarity">{stars(weapon.rarity)}</span> {weapon.type}
        </p>
        <GcsimStatus item={weapon} />
      </div>
      <section className="details-section">
        <div className="details-section-head">
          <h3>Stats</h3>
          <LevelSelect levels={levels} value={level} onChange={setLevel} label="Level" />
        </div>
        {stats && (
          <dl className="stats compact">
            <dt>Base ATK</dt>
            <dd>{Math.round(stats.base_atk!)}</dd>
            {weapon.substat && stats.substat_value != null && (
              <>
                <dt>{statName(weapon.substat)}</dt>
                <dd>{statValue(weapon.substat, stats.substat_value)}</dd>
              </>
            )}
          </dl>
        )}
      </section>
      {passive && (
        <section className="details-section">
          <div className="details-section-head">
            <h3>{weapon.passive_name || 'Passive'}</h3>
            {(weapon.refinement_values?.length ?? 0) > 1 && (
              <div className="segmented refine" role="group" aria-label="Refinement">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r} className={r === refinement ? 'selected' : ''} onClick={() => setRefinement(r)} aria-pressed={r === refinement}>
                    R{r}
                  </button>
                ))}
              </div>
            )}
          </div>
          <RichText text={passive} />
        </section>
      )}
      {description && (
        <section className="details-section">
          <RichText text={description} className="muted small" />
        </section>
      )}
    </div>
  );
}

export function SetDetails({ set, build }: { set: ArtifactSet; build?: { pieces?: 2 | 4 } }) {
  return (
    <div className="library-details">
      <div className="details-head">
        <h2>{set.name}</h2>
        <GcsimStatus item={set} />
      </div>
      {set.two_piece && (
        <section className={`details-section${build?.pieces ? ' unlocked' : ''}`}>
          <h3>2-piece</h3>
          <RichText text={set.two_piece} />
        </section>
      )}
      {set.four_piece && (
        <section className={`details-section${build?.pieces === 2 ? ' locked' : build?.pieces === 4 ? ' unlocked' : ''}`}>
          <h3>4-piece</h3>
          <RichText text={set.four_piece} />
        </section>
      )}
    </div>
  );
}
