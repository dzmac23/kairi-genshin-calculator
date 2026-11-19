// Turns a team into gcsim config lines, matching the shape of reference/sample_gcsim_config.txt:
//   neuvillette char lvl=90/90 cons=0 talent=9,9,9;
//   neuvillette add weapon="sacrificialjade" refine=1 lvl=90/90;
//   neuvillette add set="marechausseehunter" count=4;
//   neuvillette add stats atk%=0.0992 atk=344.08 ... hydro%=0.466 phys%=0;
// The stats line holds the artifact totals only: gcsim adds character, weapon and ascension stats
// itself, and applies C3/C5 talent boosts itself, so talents are base levels capped at 10.

import type { GameData } from '../data/gameData';
import { artifactsFromTotals, levelToGcsim, TOTAL_STATS, type ArtifactStatKey, type Slot, type Team } from './model';
import { artifactValue } from './stats';

export type TeamProblem = { slot: number; message: string; blocking: boolean };

/** Numbers as gcsim expects them: fractions for percentages, no long floating-point tails. */
export function num(value: number): string {
  return String(parseFloat(value.toFixed(6)));
}

const STATS_ORDER: ArtifactStatKey[] = ['atk%', 'atk', 'hp%', 'hp', 'def%', 'def', 'em', 'cr', 'cd', 'er'];

/** A slot's gcsim lines. Without `withStats`, the artifact stats line is left out. */
export function slotLines(slot: Slot, data: GameData, withStats = true): string[] {
  const character = data.character.get(slot.character!)!;
  const key = character.gcsim_key!;
  const talents = slot.talents.map((t) => Math.min(10, Math.max(1, Math.round(t)))).join(',');
  const lines = [`${key} char lvl=${levelToGcsim(slot.level)} cons=${slot.constellation} talent=${talents};`];

  const weapon = slot.weapon ? data.weapon.get(slot.weapon) : undefined;
  if (weapon?.gcsim_key) {
    lines.push(`${key} add weapon="${weapon.gcsim_key}" refine=${slot.refinement} lvl=${levelToGcsim(slot.weaponLevel)};`);
  }

  const setKey = (name: string | null) => (name ? data.set.get(name)?.gcsim_key : undefined);
  if (slot.sets.mode === '4pc' && setKey(slot.sets.set)) {
    lines.push(`${key} add set="${setKey(slot.sets.set)}" count=4;`);
  } else if (slot.sets.mode === '2+2') {
    for (const name of [slot.sets.first, slot.sets.second]) {
      if (setKey(name)) lines.push(`${key} add set="${setKey(name)}" count=2;`);
    }
  }

  if (!withStats) return lines;
  const stats = STATS_ORDER.map((k) => `${k}=${num(artifactValue(slot, k))}`);
  stats.push(`${character.element.toLowerCase()}%=${num(artifactValue(slot, 'elem%'))}`);
  stats.push(`phys%=${num(artifactValue(slot, 'phys%'))}`);
  lines.push(`${key} add stats ${stats.join(' ')};`);
  return lines;
}

/** Checks the team for things that would stop gcsim or quietly give wrong results. */
export function checkTeam(team: Team, data: GameData): TeamProblem[] {
  const problems: TeamProblem[] = [];
  const seen = new Set<string>();
  team.forEach((slot, i) => {
    if (!slot.character) return;
    const character = data.character.get(slot.character);
    if (!character) {
      problems.push({ slot: i, message: `${slot.character} is not in the game data.`, blocking: true });
      return;
    }
    if (!character.gcsim_key) {
      problems.push({
        slot: i,
        message: `${character.name} is not in gcsim yet, so this slot will be skipped in simulations.`,
        blocking: false,
      });
      return;
    }
    if (character.gcsim_patch) {
      problems.push({
        slot: i,
        message: `${character.name} is experimental: gcsim doesn't include them yet, so this app adds them from an unfinished gcsim pull request (see patches/${character.gcsim_patch}.patch). Results may not match the game.`,
        blocking: false,
      });
    }
    if (seen.has(character.name)) {
      problems.push({ slot: i, message: `${character.name} is in the team twice.`, blocking: true });
    }
    seen.add(character.name);
    const weapon = slot.weapon ? data.weapon.get(slot.weapon) : undefined;
    if (!weapon) {
      problems.push({ slot: i, message: `Pick a weapon for ${character.name}.`, blocking: true });
    } else if (!weapon.gcsim_key) {
      problems.push({ slot: i, message: `${weapon.name} is not in gcsim yet; pick another weapon.`, blocking: true });
    } else if (weapon.type !== character.weapon_type) {
      problems.push({ slot: i, message: `${character.name} can't use a ${weapon.type.toLowerCase()}.`, blocking: true });
    } else if (weapon.gcsim_patch) {
      problems.push({
        slot: i,
        message: `${weapon.name} is experimental: gcsim doesn't include it yet, so this app adds it from an unfinished gcsim pull request (see patches/${weapon.gcsim_patch}.patch). Results may not match the game.`,
        blocking: false,
      });
    }
    if (slot.statMode === 'totals' && weapon?.gcsim_key) {
      const fromArtifacts = artifactsFromTotals(slot);
      if (!fromArtifacts) {
        problems.push({ slot: i, message: `Working out ${character.name}'s artifact stats from the totals…`, blocking: true });
      } else {
        for (const { key, label, percent } of TOTAL_STATS) {
          if ((fromArtifacts[key] ?? 0) < (percent ? -0.05 : -0.5)) {
            const name = key === 'elem%' ? `${character.element} DMG Bonus` : label;
            const show = (v: number) => (percent ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString('en-US'));
            problems.push({
              slot: i,
              message: `${character.name}'s total ${name} (${show(slot.totals![key]!)}) is lower than without any artifacts (${show(slot.baseline!.stats[key])}). Check the total, level, weapon, refinement and sets.`,
              blocking: true,
            });
          }
        }
      }
    }
  });
  if (!team.some((s) => s.character && data.character.get(s.character)?.gcsim_key)) {
    problems.push({ slot: -1, message: 'Add at least one character gcsim supports.', blocking: true });
  }
  return problems;
}

/** The team part of a gcsim config. Unsupported characters are skipped (see checkTeam). */
export function teamToGcsim(team: Team, data: GameData): string {
  return team
    .filter((slot) => slot.character && data.character.get(slot.character)?.gcsim_key)
    .flatMap((slot) => slotLines(slot, data))
    .join('\n');
}
