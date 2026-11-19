import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { checkRotation, type Check } from './checks';
import { translateRotation } from './notation';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from './tokens';

let data: GameData;
const table = parseTokenTable(DEFAULT_TOKEN_TABLE);
beforeAll(async () => {
  data = await loadGameData();
});

/** Checks for a loop written with the given team (names as in the app, with constellations). */
function check(loop: string, names: string[], cons: Record<string, number> = {}): Check[] {
  const team = names.map((n) => {
    const c = data.character.get(n)!;
    return { name: c.name, key: c.gcsim_key, constellation: cons[n] ?? 0 };
  });
  const t = translateRotation({ opener: '', loop }, team, table);
  expect(t.turns.filter((x) => x.error).map((x) => x.error)).toEqual([]);
  return checkRotation(t, team.map((m) => ({ key: m.key!, name: m.name, constellation: m.constellation })), data.rules);
}
const levels = (cs: Check[]) => cs.map((c) => c.level);
const TEAM = ['Raiden Shogun', 'Bennett', 'Kaedehara Kazuha', 'Furina'];

describe('Charged Attack rules from gcsim', () => {
  it('stops sword and polearm users after a full combo or without a Normal Attack, but not mid-combo', () => {
    expect(levels(check('Raiden N5 C', TEAM))).toEqual(['stop']);
    expect(check('Raiden N5 C', TEAM)[0].message).toMatch(/after N5 the combo is finished.*N5 N1C/);
    expect(levels(check('Raiden C', TEAM))).toEqual(['stop']);
    expect(check('Raiden N4C', TEAM)).toEqual([]);
    expect(check('Raiden N2C N3', TEAM)).toEqual([]);
  });

  it('never warns Skirk, Furina or Arlecchino (gcsim lets them Charged Attack any time)', () => {
    expect(check('Skirk N5 C > Furina C > Arlecchino N6 C', ['Skirk', 'Furina', 'Arlecchino', 'Bennett'])).toEqual([]);
  });

  it('knows the other rule kinds: not right after a full combo (Lisa), right after any attack (Wriothesley)', () => {
    expect(levels(check('Lisa N4 C', ['Lisa', 'Bennett']))).toEqual(['stop']);
    expect(check('Lisa C > Lisa N3C', ['Lisa', 'Bennett'])).toEqual([]);
    expect(levels(check('Wriothesley E C', ['Wriothesley', 'Bennett']))).toEqual(['stop']);
    expect(check('Wriothesley N5 C', ['Wriothesley', 'Bennett'])).toEqual([]);
  });

  it('restarts the combo on a swap but keeps it across turns of the same character', () => {
    expect(levels(check('Raiden N3 > Bennett E > Raiden C', TEAM))).toEqual(['stop']);
    expect(check('Raiden N3 > Raiden C', TEAM)).toEqual([]);
  });

  it("doesn't guess after a conditional move", () => {
    expect(check('Raiden Q?|N5 C', TEAM)).toEqual([]);
  });
});

describe('special characters', () => {
  it('Skirk: a second skill during Seven-Phase Flash stops the run; a swap ends Flash', () => {
    const team = ['Skirk', 'Furina', 'Escoffier', 'Bennett'];
    expect(levels(check('Skirk tE N5 E', team))).toEqual(['stop']);
    expect(check('Skirk tE N5 Q > Furina E > Skirk tE', team)).toEqual([]);
    expect(check('Skirk hE tE N5 C', team)).toEqual([]); // hold skill doesn't enter Flash
  });

  it('Kinich: cannon without L stops, L fixes it, a held cannon gets a tip, no Charged Attack while grappling', () => {
    const team = ['Kinich', 'Bennett', 'Furina', 'Kaedehara Kazuha'];
    expect(levels(check('Kinich E N3 E', team))).toEqual(['stop']);
    expect(check('Kinich E L E', team)).toEqual([]);
    expect(levels(check('Kinich E L hE', team))).toEqual(['tip']);
    expect(levels(check('Kinich E C', team))).toEqual(['stop']);
    expect(levels(check('Kinich L N3', team))).toEqual(['tip']);
  });

  it('Mualani: a bite without M is weak, M fixes it (twice in a row too), no Charged Attack while surfing', () => {
    const team = ['Mualani', 'Bennett', 'Furina', 'Kaedehara Kazuha'];
    expect(levels(check('Mualani E N', team))).toEqual(['tip']);
    expect(check('Mualani E M N M N', team)).toEqual([]);
    expect(levels(check('Mualani E C', team))).toEqual(['stop']);
  });

  it('plunges need Xianyun, except characters with their own (Kazuha after his skill, with P not lP)', () => {
    expect(check('Kazuha E P', TEAM)).toEqual([]);
    expect(check('Kazuha E lP', TEAM)[0].message).toMatch(/use P, not lP/);
    expect(levels(check('Raiden P', TEAM))).toEqual(['stop']);
    expect(check('Xianyun Q > Raiden J P', ['Xianyun', 'Raiden Shogun', 'Bennett', 'Furina'])).toEqual([]);
  });

  it('warns when Chasca swaps out mid-ride (gcsim waits), not when she ends it first', () => {
    const team = ['Chasca', 'Bennett', 'Furina', 'Kaedehara Kazuha'];
    expect(levels(check('Chasca E Aim > Bennett E', team))).toEqual(['wait']);
    expect(check('Chasca E Aim E > Bennett E', team)).toEqual([]);
    // The loop wraps around: the last turn swaps into the first.
    expect(levels(check('Bennett E > Chasca E Aim', team))).toEqual(['wait']);
  });

  it('Mizuki, Neuvillette, Sandrone, Jean, Kirara, Lyney and Xilonen rules', () => {
    expect(levels(check('Mizuki E N', ['Yumemizuki Mizuki', 'Bennett']))).toEqual(['wait']);
    expect(levels(check('Neuvillette C(ticks=5) N', ['Neuvillette', 'Bennett']))).toEqual(['stop']);
    expect(check('Neuvillette C N', ['Neuvillette', 'Bennett'])).toEqual([]);
    expect(levels(check('Sandrone C(beams=4)', ['Sandrone', 'Bennett']))).toEqual(['stop']);
    expect(check('Sandrone C(beams=4)', ['Sandrone', 'Bennett'], { Sandrone: 1 })).toEqual([]);
    expect(levels(check('Jean hE', ['Jean', 'Bennett'], { Jean: 1 }))).toEqual(['tip']);
    expect(check('Jean hE(60)', ['Jean', 'Bennett'], { Jean: 1 })).toEqual([]);
    expect(levels(check('Kirara hE', ['Kirara', 'Bennett']))).toEqual(['tip']);
    expect(check('Kirara sE', ['Kirara', 'Bennett'])).toEqual([]);
    expect(levels(check('Lyney N4 Aim', ['Lyney', 'Bennett']))).toEqual(['stop']);
    expect(levels(check('Xilonen E C', ['Xilonen', 'Bennett']))).toEqual(['stop']);
  });
});

describe('shorthand: options and statement codes', () => {
  const turn = (loop: string, names: string[]) => {
    const team = names.map((n) => ({ name: n, key: data.character.get(n)!.gcsim_key }));
    return translateRotation({ opener: '', loop }, team, table).turns[0];
  };
  it('applies options: a lone number to the one option a code has, or name=value', () => {
    expect(turn('Nahida hE(60)', ['Nahida']).statements).toEqual(['nahida skill[hold=60];']);
    expect(turn('Bennett hE(2)', ['Bennett']).statements).toEqual(['bennett skill[hold=2];']);
    expect(turn('Sandrone C(beams=2)', ['Sandrone']).statements).toEqual(['sandrone charge[beams=2];']);
    expect(turn('Fischl E(recast=1)', ['Fischl']).statements).toEqual(['fischl skill[recast=1];']);
    expect(turn('Raiden N(5)', ['Raiden Shogun']).error).toMatch(/lone number only works on a code with one option/);
  });
  it('turns L and M into guarded gcsim loops, and the short holds into short_hold', () => {
    expect(turn('Kinich E L E', ['Kinich']).statements).toEqual([
      'kinich skill;',
      'while .kinich.nightsoul.state && .kinich.nightsoul.points < 20 { kinich attack; }',
      'kinich skill;',
    ]);
    expect(turn('Mualani E M N', ['Mualani']).statements?.[1]).toBe('while .mualani.nightsoul.state && .mualani.momentum < 3 { mualani walk; }');
    expect(turn('Kinich L2', ['Kinich']).error).toMatch(/already repeats until it's done/);
    expect(turn('Kirara sE', ['Kirara']).statements).toEqual(['kirara skill[short_hold=1];']);
    expect(turn('Neuvillette sC', ['Neuvillette']).statements).toEqual(['neuvillette charge[short=1];']);
    // Codes for one character don't exist for others.
    expect(turn('Bennett sE', ['Bennett']).error).toMatch(/not in the shorthand table/);
    expect(turn('Bennett L', ['Bennett']).error).toMatch(/not in the shorthand table/);
  });
});
