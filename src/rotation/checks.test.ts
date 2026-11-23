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

  it('Kinich: exact Loop Shots or Fill are both fine, a held cannon gets a tip, no Charged Attack while grappling', () => {
    const team = ['Kinich', 'Bennett', 'Furina', 'Kaedehara Kazuha'];
    expect(check('Kinich E N3 E', team)).toEqual([]); // the app tops the bar up if needed
    expect(check('Kinich E Fill E', team)).toEqual([]);
    expect(check('Kinich e fill e', team)).toEqual([]); // case doesn't matter
    expect(levels(check('Kinich E Fill hE', team))).toEqual(['tip']);
    expect(levels(check('Kinich E C', team))).toEqual(['stop']);
    expect(levels(check('Kinich Fill N3', team))).toEqual(['tip']);
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

  it("Mavuika: F (Finisher) only on her bike; after a swap the app doesn't guess", () => {
    const team = ['Mavuika', 'Bennett'];
    expect(check('Mavuika hE C3 F', team)).toEqual([]);
    expect(levels(check('Mavuika tE C F', team))).toEqual(['tip']);
    expect(check('Mavuika tE E(recast=1) C F', team)).toEqual([]); // the recast switches to the bike
    expect(check('Mavuika hE > Bennett E > Mavuika C3 F', team)).toEqual([]);
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
  it('turns Fill (and the older L and M) into guarded gcsim loops, and the short holds into short_hold', () => {
    const fill = 'while .kinich.nightsoul.state && .kinich.nightsoul.points < 20 { kinich attack; }';
    // Before each skill, the automatic top-up (it does nothing when entering the grapple or on a full bar).
    // Before each skill that may fire the cannon, the automatic top-up; not before the E that starts the
    // grapple (he swapped in) and not right after Fill.
    expect(turn('Kinich E Fill E > Bennett E', ['Kinich', 'Bennett']).statements).toEqual(['kinich skill;', fill, 'kinich skill;']);
    expect(turn('Kinich E N4 E > Bennett E', ['Kinich', 'Bennett'])).toMatchObject({ statements: ['kinich skill, attack:4;', fill, 'kinich skill;'], topUps: [1] });
    // Two turns in a row: the second one's first E may fire the cannon, so it keeps its top-up.
    expect(
      translateRotation({ opener: '', loop: 'Kinich E N2 > Kinich N2 E' }, [{ name: 'Kinich', key: 'kinich' }], table).turns[1].statements,
    ).toEqual(['kinich attack:2;', fill, 'kinich skill;']);
    expect(turn('Kinich E L E', ['Kinich']).statements).toEqual(turn('Kinich E Fill E', ['Kinich']).statements);
    expect(turn('Zibai E N3 E > Bennett E', ['Zibai', 'Bennett']).statements?.[1]).toBe('while .zibai.radiance > 0 && .zibai.radiance < 70 { zibai attack; }');
    expect(turn('Mualani E Fill N', ['Mualani']).statements?.[1]).toBe('while .mualani.nightsoul.state && .mualani.momentum < 3 { mualani walk; }');
    expect(turn('Mualani E M N', ['Mualani']).statements).toEqual(turn('Mualani E Fill N', ['Mualani']).statements);
    expect(turn('Kinich Fill2', ['Kinich']).error).toMatch(/already repeats until it's done/);
    expect(turn('Kirara sE', ['Kirara']).statements).toEqual(['kirara skill[short_hold=1];']);
    expect(turn('Neuvillette sC', ['Neuvillette']).statements).toEqual(['neuvillette charge[short=1];']);
    // Codes for one character don't exist for others.
    expect(turn('Bennett sE', ['Bennett']).error).toMatch(/not in the shorthand table/);
    expect(turn('Bennett L', ['Bennett']).error).toMatch(/not in the shorthand table/);
  });
  it('reads hold words and hold times: tE sE hE fE, hE(1.5s); upper and lower case are the same', () => {
    expect(turn('Nahida hE(1.5s)', ['Nahida']).statements).toEqual(['nahida skill[hold=90];']);
    expect(turn('nahida fe', ['Nahida']).statements).toEqual(['nahida skill[hold=300];']);
    expect(turn('Bennett fE', ['Bennett']).statements).toEqual(['bennett skill[hold=2];']);
    expect(turn('Kazuha fE', ['Kaedehara Kazuha']).statements).toEqual(['kaedeharakazuha skill[hold=1];']);
    expect(turn('Nefer hC(1s)', ['Nefer']).statements).toEqual(['nefer charge[hold=60];']);
    expect(turn('Bennett hE(1s)', ['Bennett']).error).toMatch(/levels, not a length: write hE for level 1 or fE for level 2/);
    expect(turn('Kazuha hE(1s)', ['Kaedehara Kazuha']).error).toMatch(/only one length/);
    expect(turn('Nahida hE(9s)', ['Nahida']).error).toMatch(/longest hold gcsim allows here is 5 s/);
    expect(turn('Raiden e q n5 n2c d j w aim', ['Raiden Shogun']).statements).toEqual(['raidenshogun skill, burst, attack:5, attack:2, charge, dash, jump, walk, aim;']);
  });
  it("writes Mavuika's Finisher as F, only for her", () => {
    expect(turn('Mavuika hE C3 F', ['Mavuika']).statements).toEqual(['mavuika skill[hold=1], charge:3, charge[final=1];']);
    expect(turn('mavuika he n2cf', ['Mavuika']).statements).toEqual(['mavuika skill[hold=1], attack:2, charge, charge[final=1];']);
    expect(turn('Bennett F', ['Bennett']).error).toMatch(/not in the shorthand table/);
  });
  it('reads "/" as otherwise, with any moves after it', () => {
    expect(turn('Bennett Q/N3', ['Bennett']).statements).toEqual(['if .bennett.burst.ready { bennett burst; } else { bennett attack:3; }']);
    expect(turn('Bennett Q/E/N3', ['Bennett']).statements).toEqual([
      'if .bennett.burst.ready { bennett burst; } else { if .bennett.skill.ready { bennett skill; } else { bennett attack:3; } }',
    ]);
    expect(turn('Bennett Q?/E', ['Bennett']).statements).toEqual(turn('Bennett Q/E', ['Bennett']).statements);
  });
});
