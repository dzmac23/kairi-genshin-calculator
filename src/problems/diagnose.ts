// The automatic check of why a run failed partway (some fights work, one didn't), done offline with
// the engine on the device, the way a person would investigate:
//
//   1. Play the rotation as written in FIGHTS fights and count the failures.
//      - If some fail, the failure is common enough to study as it is.
//      - If none fail, it's rare (the run hit one unlucky fight in hundreds), and testing fixes on
//        it would prove nothing: any change would "pass". So the check makes energy tighter, with
//        20%, 30%, 40%, then 50% less Energy Recharge for everyone, until it fails in at least
//        RARE_MIN of FIGHTS fights. That it then fails often shows the cause is energy.
//   2. For a common failure: play it in fights where bursts don't need energy (gcsim's
//      ignore_burst_energy). If those all work, it's about energy.
//   3. One character at a time, write their plain bursts as Q? (only if ready), under the same
//      conditions. A character whose Q? makes every test fight work is the one whose burst is
//      sometimes late.
//
// Fix tests stop at the first failure, so a change that doesn't help is usually spotted quickly.

import { buildConfig, teamMembers } from '../config/build';
import type { SimSettings } from '../config/settings';
import type { GameData } from '../data/gameData';
import { translateRotation, type RotationText, type TeamMember } from '../rotation/notation';
import type { TokenTable } from '../rotation/tokens';
import type { Team } from '../team/model';

// 60 fights: a change that only makes failures rarer (not gone) very likely still fails at least once.
export const FIGHTS = 60;

export type Runner = (config: string, fights: number, countAll?: boolean) => Promise<{ tried: number; failures: number; failure?: string }>;

/** A rare failure is studied with less ER until it fails in at least this many of FIGHTS fights. */
export const RARE_MIN = 5;
const ER_CUTS = [0.2, 0.3, 0.4, 0.5];

/** The config with `cut` less Energy Recharge for every character (0.2 = 20 percentage points). */
export const withLessEr = (config: string, cut: number) =>
  config.replace(/^(\S+ add stats(?: [^\n]*?)?) er=(-?[0-9.]+)/gm, (_, head: string, er: string) => `${head} er=${Math.max(Number(er) - cut, -0.5).toFixed(3)}`);
export type Diagnosis = {
  /** A plain-English answer, with what to change. */
  verdict: string;
  /** True: about energy; false: not; undefined: couldn't tell. */
  energy?: boolean;
  /** Characters whose burst written as Q? makes every test fight work. */
  fixes: string[];
};

/** The config with bursts that don't need energy. */
export const withoutBurstEnergy = (config: string) => config.replace(/^(options [^;\n]*);/m, '$1 ignore_burst_energy=true;');

/** Splits a rotation box into turns exactly like the translator (so turns line up with its order). */
function splitBox(text: string): { lines: { raw?: string; turns?: string[] }[] } {
  return {
    lines: text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith('!') ? { raw: l } : { turns: l.split('>').map((t) => t.trim()).filter(Boolean) })),
  };
}

/**
 * The rotation with `name`'s bursts written as Q? (only if ready). Only plain bursts change
 * ("Q" or "q"); ones that are already conditional (Q?, Q/E) stay as they are.
 */
export function burstsIfReady(rotation: RotationText, name: string, members: TeamMember[], table: TokenTable): RotationText {
  const turns = translateRotation(rotation, members, table).turns;
  let i = 0;
  const edit = (box: string) =>
    splitBox(box)
      .lines.map((line) => {
        if (line.raw) {
          i++;
          return line.raw;
        }
        return line
          .turns!.map((text) => {
            const turn = turns[i++];
            if (turn?.member?.name !== name) return text;
            return text
              .split(/\s+/)
              .map((w) => (/^q$/i.test(w) ? 'Q?' : w))
              .join(' ');
          })
          .join(' > ');
      })
      .join('\n');
  const opener = edit(rotation.opener);
  const loop = edit(rotation.loop);
  const alternates = rotation.alternates?.map(edit);
  return { opener, loop, ...(alternates ? { alternates } : {}) };
}

/** Characters with a plain (unconditional) burst somewhere in the rotation, in team order. */
function plainBursters(rotation: RotationText, members: TeamMember[], table: TokenTable): string[] {
  const turns = translateRotation(rotation, members, table).turns;
  return members.map((m) => m.name).filter((n) => turns.some((t) => t.member?.name === n && t.tokens.some((tok) => /^q$/i.test(tok.text))));
}

export async function diagnoseRun(
  input: { team: Team; data: GameData; rotation: RotationText; table: TokenTable; settings: SimSettings; after?: { done: number; total: number } },
  run: Runner,
  onStep?: (done: number, total: number) => void,
): Promise<Diagnosis> {
  const { team, data, rotation, table, settings, after } = input;
  const members = teamMembers(team, data).filter((m) => m.key);
  const build = (r: RotationText) => buildConfig(team, data, r, table, settings, 1).config;
  const config = build(rotation);
  if (!config) return { verdict: "The setup can't be run as it is now, so it couldn't be checked.", fixes: [] };

  const candidates = plainBursters(rotation, members, table);
  let done = 0;
  let total = 2 + candidates.length;
  const step = () => onStep?.(++done, total);
  onStep?.(0, total);

  // 1. Common or rare?
  const base = await run(config, FIGHTS, true);
  step();
  let cut = 0;
  let stressed = base.failures;
  if (base.failures === 0) {
    total += ER_CUTS.length - 1;
    for (const c of ER_CUTS) {
      const r = await run(withLessEr(config, c), FIGHTS, true);
      step();
      if (r.failures >= RARE_MIN) {
        cut = c;
        stressed = r.failures;
        break;
      }
    }
    if (!cut) {
      return {
        fixes: [],
        verdict: `This failure is very rare: it didn't happen in ${FIGHTS} test fights, even with half the Energy Recharge, so the app couldn't find its cause.${after ? ` (Your run had it once in ${after.done + 1} fights.)` : ''} It may be a timing coincidence rather than energy. It's rare enough not to change DPS comparisons; if it keeps happening, send the report.`,
      };
    }
    total = done + candidates.length;
  } else {
    // 2. A common failure: is it about energy?
    const energyTest = await run(withoutBurstEnergy(config), FIGHTS);
    step();
    if (energyTest.failure) {
      return {
        energy: false,
        fixes: [],
        verdict:
          "It isn't about energy: it still fails when bursts don't need energy. The move in gcsim's message probably depends on something that isn't always in place in time, such as a cooldown, a buff or state that has already ended, or a move that needs another one first.",
      };
    }
  }

  // 3. Whose burst? Under the same conditions as the failing test.
  const under = (c: string) => (cut ? withLessEr(c, cut) : c);
  const fixes: string[] = [];
  for (const name of candidates) {
    const variant = build(burstsIfReady(rotation, name, members, table));
    if (variant && !(await run(under(variant), FIGHTS)).failure) fixes.push(name);
    step();
  }

  const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
  const whose = fixes.length === 1 ? `${fixes[0]}'s burst` : `${list(fixes.map((f) => `${f}'s`))} burst`;
  const rare = cut
    ? `This failure is rare: in ${FIGHTS} test fights it didn't happen at all${after ? ` (your run had it once in ${after.done + 1} fights)` : ''}. To find its cause, the app made energy tighter: with ${Math.round(cut * 100)}% less Energy Recharge for everyone, it failed in ${stressed} of ${FIGHTS} fights, so it's about energy. `
    : '';
  if (fixes.length) {
    return {
      energy: true,
      fixes,
      verdict:
        rare +
        `${cut ? 'In that harder test, writing' : 'Writing'} ${whose} as Q? (only if ready) made all ${FIGHTS} test fights work, so ${fixes.length === 1 ? 'that burst is' : 'one of those bursts is'} sometimes not ready in time: gcsim waits for the energy, and the moves after it come too late. ` +
        (cut
          ? `It's rare enough not to change DPS comparisons much. To rule it out, write ${whose} as Q?, or give ${fixes.length === 1 ? fixes[0] : 'them'} a little more Energy Recharge.`
          : `More Energy Recharge for ${fixes.length === 1 ? fixes[0] : 'them'} also fixes it (see Energy Recharge targets on the Setup screen).`),
    };
  }
  return {
    energy: true,
    fixes,
    verdict:
      rare +
      `No single character's burst written as Q? fixes it${cut ? ' in that harder test' : ''}, so more than one burst is late: give the team more Energy Recharge (see Energy Recharge targets on the Setup screen), or write several bursts as Q?.` +
      (cut ? '' : ` (When bursts don't need energy, all ${FIGHTS} test fights work.)`),
  };
}
