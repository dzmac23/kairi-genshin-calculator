// Joins the team, the rotation and the fight settings into one gcsim config, in the shape of
// reference/sample_gcsim_config.txt:
//   <team lines>
//   options iteration=N duration=D swap_delay=12;
//   target lvl=L resist=R radius=2 pos=...;      (one per enemy; never hp=, see PROJECT_PLAN.md)
//   energy every interval=480,720 amount=1;       (when random energy is on)
//   active <first character>;
//   <loop counters, only when the rotation uses @>
//   <opener statements, run once>
//   while 1 { <loop statements> }

import type { GameData } from '../data/gameData';
import { translateRotation, type RotationText, type TeamMember, type Translation, type Turn } from '../rotation/notation';
import type { TokenTable } from '../rotation/tokens';
import { checkTeam, num, teamToGcsim } from '../team/gcsim';
import type { Team } from '../team/model';
import { enemyPositions, type SimSettings } from './settings';

export type BuildResult = {
  /** The config, when nothing blocks a run. */
  config?: string;
  /**
   * The same config with a print("kc o1") / print("kc l3") marker before each turn. Used only for
   * the replays that measure rotation timing (see rotation/timing.ts), never for the DPS run.
   */
  timingConfig?: string;
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

/** The marker printed before a turn in the timing config: "kc o2" (opener turn 2), "kc l3" (loop turn 3). */
export function turnMarker(turn: Pick<Turn, 'section' | 'index'>): string {
  return `kc ${turn.section === 'opener' ? 'o' : 'l'}${turn.index}`;
}

export function buildConfig(
  team: Team,
  data: GameData,
  rotation: RotationText,
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
  const loopTurns = translation.turns.filter((t) => t.section === 'loop');
  if (!rotation.loop.trim()) problems.push('Rotation: type a Loop on the Rotation screen.');
  for (const t of translation.turns) {
    if (t.error) problems.push(`Rotation (${t.section === 'opener' ? 'Opener' : 'Loop'} turn ${t.index}): ${t.error}`);
  }
  if (rotation.loop.trim() && translation.ok && !loopTurns.some((t) => t.statements && !t.raw)) {
    problems.push('Rotation: no Loop turn uses a character gcsim supports.');
  }
  if (table.errors.length) problems.push(`Shorthand table: ${table.errors[0].message}`);

  if (problems.length) return { problems, notes, translation };

  const firstTurn = translation.turns.find((t) => t.statements && !t.raw && t.member?.key);
  const first = firstTurn!.member!.key!;
  const { counters } = translation;
  const make = (markers: boolean) => {
    const body = (section: 'opener' | 'loop', indent: string) =>
      translation.turns
        .filter((t) => t.section === section && t.statements)
        .flatMap((t) => [...(markers ? [`print("${turnMarker(t)}");`] : []), ...t.statements!])
        .map((l) => indent + l);
    return [
      teamToGcsim(team, data),
      '',
      `options iteration=${iterations} duration=${num(settings.duration)} swap_delay=12;`,
      ...enemyPositions(settings.enemies).map(
        ([x, y]) => `target lvl=${settings.enemyLevel} resist=${num(settings.enemyResist / 100)} radius=2 pos=${num(x)},${num(y)};`,
      ),
      ...(settings.randomEnergy ? ['energy every interval=480,720 amount=1;'] : []),
      `active ${first};`,
      ...(counters.loop ? ['let kc_loop = 0;'] : []),
      ...counters.cycles.map((n) => `let kc_c${n} = 0;`),
      ...body('opener', ''),
      'while 1 {',
      ...(counters.loop ? ['  kc_loop = kc_loop + 1;'] : []),
      ...counters.cycles.flatMap((n) => [`  kc_c${n} = kc_c${n} + 1;`, `  if kc_c${n} > ${n} { kc_c${n} = 1; }`]),
      ...body('loop', '  '),
      '}',
    ].join('\n');
  };
  return { config: make(false), timingConfig: make(true), problems, notes, translation };
}
