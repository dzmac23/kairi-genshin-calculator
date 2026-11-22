import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { checkTeam, num, teamToGcsim } from './gcsim';
import { cleanSlot, cleanTeam, emptySlot, levelToGcsim, type Team } from './model';
import { byKey, placeholderTeam } from './placeholderTeam.testutil';
import { computeStats } from './stats';

const configLines = readFileSync('reference/sample_gcsim_config.txt', 'utf8').split('\n');
const result = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));

let data: GameData;
let team: Team;

beforeAll(async () => {
  data = await loadGameData();
  team = placeholderTeam(data);
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

  it('lists exactly the five characters gcsim v2.50.0 does not support, and the ones added by patches', () => {
    const unsupported = data.characters.filter((c) => !c.gcsim_key).map((c) => c.name);
    expect(unsupported).toEqual(['Kachina', 'Lohen', 'Mitya', 'Valeriy', 'Vesna']);
    const patched = data.characters.filter((c) => c.gcsim_patch).map((c) => `${c.name}: patches/${c.gcsim_patch}.patch`);
    expect(patched).toEqual(['Linnea: patches/linnea.patch', 'Nefer: patches/nefer.patch', 'Vodyanitsa: patches/vodyanitsa.patch']);
    // Every patch in patches/ belongs to a character or weapon (apart from the engine additions,
    // listed in patches/README.md), and every patched one has a patch file.
    const ENGINE_ADDITIONS = ['wasm-energy'];
    const files = readdirSync('patches').filter((f) => f.endsWith('.patch')).map((f) => f.replace('.patch', '')).filter((f) => !ENGINE_ADDITIONS.includes(f));
    const owners = [...data.characters, ...data.weapons].filter((x) => x.gcsim_patch).map((x) => x.gcsim_patch);
    expect(files.sort()).toEqual(owners.sort());
    expect(data.weapons.filter((w) => w.gcsim_patch).map((w) => `${w.name}: patches/${w.gcsim_patch}.patch`)).toEqual(['Starsealed Edict: patches/starsealed.patch']);
  });

  it('warns that a patched weapon is experimental, without blocking a run', () => {
    const t: Team = [{ ...team[0], weapon: 'Starsealed Edict' }]; // Neuvillette uses catalysts
    const p = checkTeam(t, data).find((x) => x.message.includes('Starsealed Edict is experimental'));
    expect(p).toMatchObject({ slot: 0, blocking: false });
    expect(teamToGcsim(t, data)).toContain('neuvillette add weapon="starsealededict" refine=1 lvl=90/90;');
  });

  it('warns that a patched character is experimental, without blocking a run', () => {
    const t: Team = [{ ...team[0], character: 'Linnea', weapon: data.weapons.find((w) => w.gcsim_key === 'favoniuswarbow')!.name }];
    const p = checkTeam(t, data).find((x) => x.message.includes('experimental'));
    expect(p).toMatchObject({ slot: 0, blocking: false });
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

describe('repairing saved or imported team data', () => {
  it('keeps good values and replaces malformed ones with defaults', () => {
    const slot = cleanSlot({ character: 'Furina', talents: 9, constellation: 9, level: '85+', refinement: '5', sets: { mode: 'weird' }, artifacts: { cr: 40, cd: 'lots', bogus: 3 } });
    expect(slot).toEqual({ ...emptySlot(), character: 'Furina', constellation: 6, artifacts: { cr: 40 } });
  });
  it('accepts a whole team only with exactly four slots', () => {
    expect(cleanTeam([1, 2, 3])).toBeUndefined();
    expect(cleanTeam([{}, null, 'x', { character: 'Skirk' }])!.map((s) => s.character)).toEqual([null, null, null, 'Skirk']);
  });
});
