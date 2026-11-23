// The automatic check of why a run failed partway (some fights work, one didn't), done offline with
// the engine on the device, the way a person would investigate:
//
//   1. Play the rotation in fights where bursts don't need energy (gcsim's ignore_burst_energy).
//      If those all work, the failures are about energy: a burst wasn't always ready in time, so
//      gcsim waited for it and the moves after it came too late.
//   2. Then, one character at a time, write their bursts as Q? (only if ready). A character whose
//      Q? makes every fight work is the cause.
//
// Each test plays up to FIGHTS fights and stops at the first failure, so a fix takes FIGHTS fights
// to confirm and a non-fix is usually spotted quickly.

import { buildConfig, teamMembers } from '../config/build';
import type { SimSettings } from '../config/settings';
import type { GameData } from '../data/gameData';
import { translateRotation, type RotationText, type TeamMember } from '../rotation/notation';
import type { TokenTable } from '../rotation/tokens';
import type { Team } from '../team/model';

// 60 fights: a change that only makes failures rarer (not gone) very likely still fails at least once.
export const FIGHTS = 60;

export type Runner = (config: string, fights: number) => Promise<{ tried: number; failure?: string }>;
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
  input: { team: Team; data: GameData; rotation: RotationText; table: TokenTable; settings: SimSettings },
  run: Runner,
  onStep?: (done: number, total: number) => void,
): Promise<Diagnosis> {
  const { team, data, rotation, table, settings } = input;
  const members = teamMembers(team, data).filter((m) => m.key);
  const build = (r: RotationText) => buildConfig(team, data, r, table, settings, 1).config;
  const config = build(rotation);
  if (!config) return { verdict: "The setup can't be run as it is now, so it couldn't be checked.", fixes: [] };

  const candidates = plainBursters(rotation, members, table);
  const total = 1 + candidates.length;
  onStep?.(0, total);
  const energyTest = await run(withoutBurstEnergy(config), FIGHTS);
  onStep?.(1, total);
  if (energyTest.failure) {
    return {
      energy: false,
      fixes: [],
      verdict:
        "It isn't about energy: it still fails when bursts don't need energy. The move in gcsim's message probably depends on something that isn't always in place in time, such as a cooldown, a buff or state that has already ended, or a move that needs another one first.",
    };
  }

  const fixes: string[] = [];
  for (const [n, name] of candidates.entries()) {
    const variant = build(burstsIfReady(rotation, name, members, table));
    if (variant && !(await run(variant, FIGHTS)).failure) fixes.push(name);
    onStep?.(2 + n, total);
  }
  const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
  if (fixes.length) {
    return {
      energy: true,
      fixes,
      verdict:
        `${fixes.length === 1 ? `${fixes[0]}'s burst isn't` : `A burst (${list(fixes)}) isn't`} always ready in time: gcsim waits for the energy, and the moves after it come too late. ` +
        `With ${fixes.length === 1 ? `${fixes[0]}'s burst` : `any one of ${list(fixes.map((f) => `${f}'s`))} bursts`} written as Q? (only if ready), the rotation worked in all ${FIGHTS} test fights. ` +
        `More Energy Recharge for ${fixes.length === 1 ? fixes[0] : 'them'} also fixes it (see Energy Recharge targets on the Setup screen).`,
    };
  }
  return {
    energy: true,
    fixes,
    verdict: `It's about energy: when bursts don't need energy, all ${FIGHTS} test fights work. No single character's burst written as Q? fixes it, so more than one burst is late: give the team more Energy Recharge (see Energy Recharge targets on the Setup screen), or write several bursts as Q?.`,
  };
}
