import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { checkTeam, num, teamToGcsim } from './gcsim';
import { emptySlot, levelToGcsim, type Slot, type Team } from './model';
import { computeStats } from './stats';

// The placeholder test team (builds chosen for testing, not the owner's real builds), entered the
// way the Team screen stores it: artifact totals with percentages typed as percentages.
const configLines = readFileSync('reference/sample_gcsim_config.txt', 'utf8').split('\n');
const result = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));

let data: GameData;
let team: Team;

const byKey = <T extends { gcsim_key: string | null; name: string }>(list: T[], key: string) =>
  list.find((x) => x.gcsim_key === key)!.name;

beforeAll(async () => {
  data = await loadGameData();
  const slot = (character: string, weapon: string, refinement: number, set: string, artifacts: Slot['artifacts']): Slot => ({
    ...emptySlot(),
    character: byKey(data.characters, character),
    weapon: byKey(data.weapons, weapon),
    refinement,
    sets: { mode: '4pc', set: byKey(data.sets, set) },
    artifacts,
  });
  const shared = { 'atk%': 9.92, atk: 344.08, hp: 5287.88, 'def%': 12.4, def: 39.36 };
  team = [
    slot('neuvillette', 'sacrificialjade', 1, 'marechausseehunter', {
      ...shared, 'hp%': 56.52, em: 39.64, cr: 33.1, cd: 128.4, er: 11.02, 'elem%': 46.6,
    }),
    slot('kaedeharakazuha', 'xiphosmoonlight', 1, 'viridescentvenerer', {
      ...shared, 'hp%': 9.92, em: 640.28, cr: 33.1, cd: 66.2, er: 22.04,
    }),
    slot('furina', 'fleuvecendreferryman', 5, 'goldentroupe', {
      ...shared, 'hp%': 103.12, em: 39.64, cr: 64.2, cd: 79.4, er: 22.04,
    }),
    slot('xilonen', 'theflute', 5, 'scrolloftheheroofcindercity', {
      ...shared, 'hp%': 9.92, 'def%': 187.3, em: 39.64, cr: 33.1, cd: 66.2, er: 22.04,
    }),
  ];
});

describe('teamToGcsim', () => {
  it('reproduces the team lines of the placeholder test team config exactly', () => {
    expect(teamToGcsim(team, data).split('\n')).toEqual(configLines.slice(0, 16));
  });

  it('writes 2+2 sets as two count=2 lines', () => {
    const t: Team = [{ ...team[0], sets: { mode: '2+2', first: byKey(data.sets, 'marechausseehunter'), second: byKey(data.sets, 'goldentroupe') } }];
    const lines = teamToGcsim(t, data).split('\n');
    expect(lines).toContain('neuvillette add set="marechausseehunter" count=2;');
    expect(lines).toContain('neuvillette add set="goldentroupe" count=2;');
  });

  it('caps talents at 10 and writes constellation and levels', () => {
    const t: Team = [{ ...team[0], constellation: 2, talents: [12, 10, 1], level: '80+', weaponLevel: '70' }];
    expect(teamToGcsim(t, data).split('\n')[0]).toBe('neuvillette char lvl=80/90 cons=2 talent=10,10,1;');
    expect(teamToGcsim(t, data).split('\n')[1]).toBe('neuvillette add weapon="sacrificialjade" refine=1 lvl=70/70;');
  });

  it('skips characters gcsim does not support, with a warning', () => {
    const t: Team = [team[0], { ...emptySlot(), character: 'Kachina' }];
    expect(teamToGcsim(t, data)).not.toContain('kachina');
    const problems = checkTeam(t, data);
    expect(problems).toContainEqual({ slot: 1, message: expect.stringContaining('not in gcsim yet'), blocking: false });
  });
});

describe('gcsim v2.50.0 support', () => {
  it('treats Sandrone (added in v2.50.0) as supported', () => {
    const t: Team = [{ ...emptySlot(), character: 'Sandrone', weapon: byKey(data.weapons, 'wolfsgravestone') }];
    expect(checkTeam(t, data)).toEqual([]);
    expect(teamToGcsim(t, data).split('\n')[0]).toBe('sandrone char lvl=90/90 cons=0 talent=9,9,9;');
  });

  it('lists exactly the eight characters gcsim v2.50.0 does not support', () => {
    const unsupported = data.characters.filter((c) => !c.gcsim_key).map((c) => c.name);
    expect(unsupported).toEqual(['Kachina', 'Linnea', 'Lohen', 'Mitya', 'Nefer', 'Valeriy', 'Vesna', 'Vodyanitsa']);
  });
});

describe('checkTeam', () => {
  it('finds no problems with the placeholder test team', () => {
    expect(checkTeam(team, data)).toEqual([]);
  });

  it('flags a missing weapon, a wrong weapon type and duplicates', () => {
    const noWeapon = checkTeam([{ ...team[0], weapon: null }], data);
    expect(noWeapon[0].message).toMatch(/Pick a weapon/);
    const wrongType = checkTeam([{ ...team[0], weapon: byKey(data.weapons, 'theflute') }], data);
    expect(wrongType[0].message).toMatch(/can't use a sword/);
    const dupes = checkTeam([team[0], team[0]], data);
    expect(dupes.some((p) => /twice/.test(p.message))).toBe(true);
  });

  it('needs at least one supported character', () => {
    expect(checkTeam([emptySlot()], data)[0].message).toMatch(/at least one/);
  });
});

describe('computeStats matches the stats gcsim recorded for each character', () => {
  // gcsim's snapshot order (pkg/core/attributes): 2 DEF, 3 HP, 5 ATK, 7 ER, 8 EM, 9 CR, 10 CD,
  // 23 base HP, 24 base ATK (character + weapon), 25 base DEF.
  it.each([0, 1, 2, 3])('slot %i', (i) => {
    const slot = team[i];
    const stats = computeStats(slot, data.character.get(slot.character!)!, data.weapon.get(slot.weapon!));
    const snap: number[] = result.character_details[i].snapshot;
    expect(stats.baseHp).toBeCloseTo(snap[23], 2);
    expect(stats.baseAtk).toBeCloseTo(snap[24], 2);
    expect(stats.baseDef).toBeCloseTo(snap[25], 2);
    expect(stats.atk).toBeCloseTo(snap[5], 2);
    expect(stats.def).toBeCloseTo(snap[2], 2);
    expect(stats.em).toBeCloseTo(snap[8], 2);
    expect(stats.cr).toBeCloseTo(snap[9], 4);
    expect(stats.cd).toBeCloseTo(snap[10], 4);
    // gcsim's HP also includes the Hydro resonance (+25% HP, two Hydro characters), a team buff
    // the Team screen leaves to gcsim.
    expect(stats.hp + stats.baseHp * 0.25).toBeCloseTo(snap[3], 1);
  });
});

describe('helpers', () => {
  it('converts level keys the way the plan describes', () => {
    expect(levelToGcsim('80+')).toBe('80/90');
    expect(levelToGcsim('80')).toBe('80/80');
    expect(levelToGcsim('90')).toBe('90/90');
    expect(levelToGcsim('95')).toBe('95/100');
    expect(levelToGcsim('100')).toBe('100/100');
    expect(levelToGcsim('1')).toBe('1/20');
    expect(levelToGcsim('20+')).toBe('20/40');
  });

  it('formats numbers without floating-point tails', () => {
    expect(num(9.92 / 100)).toBe('0.0992');
    expect(num(128.4 / 100)).toBe('1.284');
    expect(num(0)).toBe('0');
  });
});
