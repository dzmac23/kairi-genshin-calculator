// Joins the team, the rotation and the fight settings into one gcsim config, in the shape of
// reference/sample_gcsim_config.txt:
//   <team lines>
//   options iteration=N duration=D swap_delay=12;
//   target lvl=L resist=R radius=2 pos=...;      (one per enemy; never hp=, see PROJECT_PLAN.md)
//   energy every interval=480,720 amount=1;       (when random energy is on)
//   active <first character>;
//   while 1 { <one line per rotation turn> }

import type { GameData } from '../data/gameData';
import { translateRotation, type TeamMember, type Translation } from '../rotation/notation';
import type { TokenTable } from '../rotation/tokens';
import { checkTeam, num, teamToGcsim } from '../team/gcsim';
import type { Team } from '../team/model';
import { enemyPositions, type SimSettings } from './settings';

export type BuildResult = {
  /** The config, when nothing blocks a run. */
  config?: string;
  /** Things that must be fixed before running. */
  problems: string[];
  /** Things worth knowing that don't block a run (e.g. a skipped character). */
  notes: string[];
  translation: Translation;
};

export function teamMembers(team: Team, data: GameData): TeamMember[] {
  return team
    .filter((s) => s.character && data.character.get(s.character))
    .map((s) => {
      const c = data.character.get(s.character!)!;
      return { name: c.name, key: c.gcsim_key };
    });
}

export function buildConfig(
  team: Team,
  data: GameData,
  rotation: string,
  table: TokenTable,
  settings: SimSettings,
  iterations: number,
): BuildResult {
  const problems: string[] = [];
  const notes: string[] = [];

  // Blocking team problems stop the run. (The only non-blocking one, an unsupported character,
  // is explained by the clearer DPS note below instead.)
  for (const p of checkTeam(team, data)) {
    if (p.blocking) problems.push((p.slot >= 0 ? `Team slot ${p.slot + 1}: ` : 'Team: ') + p.message);
  }
  const skipped = teamMembers(team, data).filter((m) => !m.key);
  if (skipped.length) {
    notes.push(
      `DPS will not include ${skipped.map((m) => m.name).join(', ')} (not in gcsim yet): their damage and the buffs they give the team are missing.`,
    );
  }

  const translation = translateRotation(rotation, teamMembers(team, data), table);
  if (!rotation.trim()) problems.push('Rotation: type a rotation on the Rotation screen.');
  for (const t of translation.turns) if (t.error) problems.push(`Rotation: ${t.error}`);
  const lines = translation.turns.filter((t) => t.gcsim).map((t) => t.gcsim!);
  if (rotation.trim() && translation.ok && lines.length === 0) problems.push('Rotation: no turn uses a character gcsim supports.');
  if (table.errors.length) problems.push(`Shorthand table: ${table.errors[0].message}`);

  if (problems.length) return { problems, notes, translation };

  const first = translation.turns.find((t) => t.gcsim)!.member!.key!;
  const config = [
    teamToGcsim(team, data),
    '',
    `options iteration=${iterations} duration=${num(settings.duration)} swap_delay=12;`,
    ...enemyPositions(settings.enemies).map(
      ([x, y]) => `target lvl=${settings.enemyLevel} resist=${num(settings.enemyResist / 100)} radius=2 pos=${num(x)},${num(y)};`,
    ),
    ...(settings.randomEnergy ? ['energy every interval=480,720 amount=1;'] : []),
    `active ${first};`,
    'while 1 {',
    ...lines.map((l) => `  ${l}`),
    '}',
  ].join('\n');
  return { config, problems, notes, translation };
}
