import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { translateRotation, translateToken } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from '../rotation/tokens';
import { emptySlot, type Team } from '../team/model';
import { placeholderTeam } from '../team/placeholderTeam.testutil';
import { buildConfig, teamMembers } from './build';
import { cleanSettings, DEFAULT_SETTINGS, enemyPositions } from './settings';

// The example rotation from PROJECT_PLAN.md, written the community way.
const PLAN_ROTATION = 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2';
const table = parseTokenTable(DEFAULT_TOKEN_TABLE);
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

let data: GameData;
let team: Team;
beforeAll(async () => {
  data = await loadGameData();
  team = placeholderTeam(data);
});

describe('buildConfig (Phase 1 acceptance check)', () => {
  it('reproduces reference/sample_gcsim_config.txt from the Team screen + the plan rotation + default settings', () => {
    const sample = readFileSync('reference/sample_gcsim_config.txt', 'utf8');
    const result = buildConfig(team, data, PLAN_ROTATION, table, DEFAULT_SETTINGS, 500);
    expect(result.problems).toEqual([]);
    expect(lines(result.config!)).toEqual(lines(sample));
  });

  it('writes one target line per enemy, without overlaps, and leaves out energy when off', () => {
    const result = buildConfig(team, data, PLAN_ROTATION, table, { ...DEFAULT_SETTINGS, enemies: 3, randomEnergy: false, enemyResist: 25 }, 100);
    const targets = lines(result.config!).filter((l) => l.startsWith('target'));
    expect(targets).toEqual([
      'target lvl=100 resist=0.25 radius=2 pos=2.4,0;',
      'target lvl=100 resist=0.25 radius=2 pos=2.4,4.1;',
      'target lvl=100 resist=0.25 radius=2 pos=2.4,-4.1;',
    ]);
    expect(result.config).not.toContain('energy every');
    // Never give enemies HP: gcsim would then run until they die instead of for the set duration.
    expect(targets.some((l) => l.includes('hp='))).toBe(false);
  });

  it('keeps every enemy at least 4 m from the others (radius 2 each)', () => {
    const pos = enemyPositions(5);
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) expect(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])).toBeGreaterThan(4);
  });

  it('blocks a run and explains why when the rotation is empty or wrong', () => {
    expect(buildConfig(team, data, '', table, DEFAULT_SETTINGS, 100).problems[0]).toMatch(/type a rotation/);
    const typo = buildConfig(team, data, 'Furina tE Qq', table, DEFAULT_SETTINGS, 100);
    expect(typo.config).toBeUndefined();
    expect(typo.problems[0]).toMatch(/"Qq" is not in the shorthand table: it doesn't know "q"/);
    const stranger = buildConfig(team, data, 'Bennett E Q', table, DEFAULT_SETTINGS, 100);
    expect(stranger.problems[0]).toMatch(/"Bennett" is not a character in your team/);
  });

  it('skips an unsupported character with a note saying DPS leaves them out', () => {
    const withKachina: Team = [team[0], team[1], team[2], { ...emptySlot(), character: 'Kachina' }];
    const result = buildConfig(withKachina, data, 'Neuvillette tE > Kachina E Q > Furina Q', table, DEFAULT_SETTINGS, 100);
    expect(result.problems).toEqual([]);
    expect(result.notes).toEqual([expect.stringMatching(/^DPS will not include Kachina/)]);
    expect(result.config).not.toContain('kachina');
    expect(result.translation.turns[1].note).toMatch(/skipped/);
  });
});

describe('rotation notation', () => {
  it('translates the plan example turn by turn', () => {
    const t = translateRotation(PLAN_ROTATION, teamMembers(team, data), table);
    expect(t.ok).toBe(true);
    expect(t.turns.map((x) => x.gcsim)).toEqual([
      'neuvillette skill;',
      'kaedeharakazuha skill, high_plunge;',
      'furina skill, dash, burst;',
      'xilonen skill, attack:5, burst;',
      'neuvillette charge, skill, burst, charge:2;',
    ]);
  });

  it('accepts full names, any word of a name, gcsim keys and new lines between turns', () => {
    const t = translateRotation('Kaedehara Kazuha E\nkaedeharakazuha Q\nkazuha hP', teamMembers(team, data), table);
    expect(t.turns.map((x) => x.gcsim)).toEqual([
      'kaedeharakazuha skill;',
      'kaedeharakazuha burst;',
      'kaedeharakazuha high_plunge;',
    ]);
  });

  it('handles repeats, combined tokens and gcsim pass-through', () => {
    const codes = table.general;
    expect(translateToken('N5', codes).actions).toEqual(['attack:5']);
    expect(translateToken('N2C', codes).actions).toEqual(['attack:2', 'charge']);
    expect(translateToken('hE', codes).actions).toEqual(['skill[hold=1]']);
    expect(translateToken('lP', codes).actions).toEqual(['low_plunge']);
    expect(translateToken('attack:3', codes).actions).toEqual(['attack:3']);
    expect(translateToken('skill[hold=1]', codes).actions).toEqual(['skill[hold=1]']);
    expect(translateToken('burst', codes).actions).toEqual(['burst']);
    expect(translateToken('Z', codes).error).toMatch(/not in the shorthand table/);
    expect(translateToken('N0', codes).error).toMatch(/0 times/);
  });

  it('lets character-specific entries win over the general table', () => {
    const custom = parseTokenTable(DEFAULT_TOKEN_TABLE + '\nNeuvillette: C = charge[hold=1]\n');
    const t = translateRotation('Neuvillette C > Furina C', teamMembers(team, data), custom);
    expect(t.turns.map((x) => x.gcsim)).toEqual(['neuvillette charge[hold=1];', 'furina charge;']);
  });

  it('reports badly written table lines', () => {
    const bad = parseTokenTable('E = skill\nthis is wrong\nX = two words');
    expect(bad.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(bad.general.get('E')).toBe('skill');
  });
});

describe('settings', () => {
  it('keeps values within limits and fills in missing ones', () => {
    expect(cleanSettings({ duration: -5, enemies: 9, enemyLevel: 100.4 })).toEqual({ ...DEFAULT_SETTINGS, duration: 1, enemies: 5 });
    expect(cleanSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});
