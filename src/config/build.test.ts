import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { translateCodes, translateRotation, type RotationText, type TeamMember } from '../rotation/notation';
import { DEFAULT_TOKEN_TABLE, parseTokenTable } from '../rotation/tokens';
import { emptySlot, type Team } from '../team/model';
import { placeholderTeam } from '../team/placeholderTeam.testutil';
import { buildConfig, teamMembers } from './build';
import { cleanSettings, DEFAULT_SETTINGS, enemyPositions } from './settings';

// The example rotation from PROJECT_PLAN.md, written the community way.
const PLAN_ROTATION: RotationText = { opener: '', loop: 'Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2' };
const loop = (text: string): RotationText => ({ opener: '', loop: text });
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
    expect(buildConfig(team, data, loop(''), table, DEFAULT_SETTINGS, 100).problems[0]).toMatch(/type a Loop/);
    const typo = buildConfig(team, data, loop('Furina tE Qq'), table, DEFAULT_SETTINGS, 100);
    expect(typo.config).toBeUndefined();
    expect(typo.problems[0]).toMatch(/"Qq" is not in the shorthand table: it doesn't know "q"/);
    const stranger = buildConfig(team, data, loop('Bennett E Q'), table, DEFAULT_SETTINGS, 100);
    expect(stranger.problems[0]).toMatch(/"Bennett" is not a character in your team/);
  });

  it('skips an unsupported character with a note saying DPS leaves them out', () => {
    const withKachina: Team = [team[0], team[1], team[2], { ...emptySlot(), character: 'Kachina' }];
    const result = buildConfig(withKachina, data, loop('Neuvillette tE > Kachina E Q > Furina Q'), table, DEFAULT_SETTINGS, 100);
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
    expect(t.turns.map((x) => x.statements)).toEqual([
      ['neuvillette skill;'],
      ['kaedeharakazuha skill, high_plunge;'],
      ['furina skill, dash, burst;'],
      ['xilonen skill, attack:5, burst;'],
      ['neuvillette charge, skill, burst, charge:2;'],
    ]);
  });

  it('accepts full names, any word of a name, gcsim keys and new lines between turns', () => {
    const t = translateRotation(loop('Kaedehara Kazuha E\nkaedeharakazuha Q\nkazuha hP'), teamMembers(team, data), table);
    expect(t.turns.map((x) => x.statements)).toEqual([['kaedeharakazuha skill;'], ['kaedeharakazuha burst;'], ['kaedeharakazuha high_plunge;']]);
  });

  it('handles repeats, combined tokens and gcsim pass-through', () => {
    const codes = table.general;
    expect(translateCodes('N5', codes).actions).toEqual(['attack:5']);
    expect(translateCodes('N2C', codes).actions).toEqual(['attack:2', 'charge']);
    expect(translateCodes('hE', codes).actions).toEqual(['skill[hold=1]']);
    expect(translateCodes('lP', codes).actions).toEqual(['low_plunge']);
    expect(translateCodes('EE', codes).actions).toEqual(['skill', 'skill']);
    expect(translateCodes('W', codes).actions).toEqual(['walk']);
    expect(translateCodes('attack:3', codes).actions).toEqual(['attack:3']);
    expect(translateCodes('skill[hold=1]', codes).actions).toEqual(['skill[hold=1]']);
    expect(translateCodes('burst', codes).actions).toEqual(['burst']);
    expect(translateCodes('Z', codes).error).toMatch(/not in the shorthand table/);
    expect(translateCodes('N0', codes).error).toMatch(/0 times/);
  });

  it('lets character-specific entries win over the general table', () => {
    const custom = parseTokenTable(DEFAULT_TOKEN_TABLE + '\nNeuvillette: C = charge[hold=1]\n');
    const t = translateRotation(loop('Neuvillette C > Furina C'), teamMembers(team, data), custom);
    expect(t.turns.map((x) => x.statements)).toEqual([['neuvillette charge[hold=1];'], ['furina charge;']]);
  });

  it('reports badly written table lines', () => {
    const bad = parseTokenTable('E = skill\nthis is wrong\nX = two words');
    expect(bad.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(bad.general.get('E')).toBe('skill');
  });
});

// The owner's real rotations (see the Step 5b discussion). Stand-in gcsim keys are used for Mitya
// and Valeriy, who aren't in gcsim yet, so the translation itself can be checked.
const skirkTeam: TeamMember[] = [
  { name: 'Skirk', key: 'skirk' },
  { name: 'Furina', key: 'furina' },
  { name: 'Escoffier', key: 'escoffier' },
  { name: 'Yelan', key: 'yelan' },
  { name: 'Shenhe', key: 'shenhe' },
];
const mityaTeam: TeamMember[] = [
  { name: 'Mitya', key: 'mitya' },
  { name: 'Sucrose', key: 'sucrose' },
  { name: 'Odette', key: 'odette' },
  { name: 'Valeriy', key: 'valeriy' },
];

describe('opener, if ready, every N loops, otherwise', () => {
  it('first loop only: a separate Opener (Skirk)', () => {
    const t = translateRotation(
      {
        opener: 'Skirk hE > Furina E D Q > Escoffier E Q N1 > Yelan E Q N2 > Skirk hE Q > Furina N4 D N2',
        loop: 'Furina E D Q N4 D N2 > Escoffier E Q N1 > Yelan E Q N2 > Skirk hE Q > Furina N4 D N2',
      },
      skirkTeam,
      table,
    );
    expect(t.ok).toBe(true);
    expect(t.turns.filter((x) => x.section === 'opener').map((x) => x.statements![0])).toEqual([
      'skirk skill[hold=1];',
      'furina skill, dash, burst;',
      'escoffier skill, burst, attack;',
      'yelan skill, burst, attack:2;',
      'skirk skill[hold=1], burst;',
      'furina attack:4, dash, attack:2;',
    ]);
    expect(t.turns.filter((x) => x.section === 'loop')[0].statements).toEqual(['furina skill, dash, burst, attack:4, dash, attack:2;']);
  });

  it('if ready: tE? only taps when the skill is ready (Skirk/Shenhe)', () => {
    const t = translateRotation(
      { opener: 'Skirk hE', loop: 'Furina E D Q > Escoffier E Q > Shenhe hE Q tE? > Skirk tE N5 Q N5 D N3 C N3 W' },
      skirkTeam,
      table,
    );
    expect(t.ok).toBe(true);
    expect(t.turns[3].statements).toEqual(['shenhe skill[hold=1], burst;', 'if .shenhe.skill.ready { shenhe skill; }']);
    expect(t.turns[4].statements).toEqual(['skirk skill, attack:5, burst, attack:5, dash, attack:3, charge, attack:3, walk;']);
  });

  it('every other loop, if ready, otherwise: Sucrose N1 Q?@1/2|E (Mitya/Valeriy)', () => {
    const rotation = {
      opener: 'Mitya tE > Sucrose N1 E > Odette EE > Valeriy E C Q > Mitya tE C D Q C D N2 C',
      loop: 'Odette EE > Mitya tE > Valeriy E C Q > Sucrose N1 Q?@1/2|E > Mitya tE C D Q C D N2 C',
    };
    const t = translateRotation(rotation, mityaTeam, table);
    expect(t.ok).toBe(true);
    expect(t.counters).toEqual({ loop: false, cycles: [2] });
    const sucrose = t.turns.find((x) => x.section === 'loop' && x.member?.name === 'Sucrose')!;
    expect(sucrose.statements).toEqual([
      'sucrose attack;',
      'if .sucrose.burst.ready && kc_c2 == 1 { sucrose burst; } else { sucrose skill; }',
    ]);
    expect(t.turns.at(-1)!.statements).toEqual(['mitya skill, charge, dash, burst, charge, dash, attack:2, charge;']);
  });

  it('supports @2/2, @1/3 and @2+ and rejects @ in the Opener', () => {
    const t = translateRotation({ opener: '', loop: 'Odette Q@2/2 > Sucrose Q@1/3 > Mitya Q@2+' }, mityaTeam, table);
    expect(t.turns.map((x) => x.statements)).toEqual([
      ['if kc_c2 == 2 { odette burst; }'],
      ['if kc_c3 == 1 { sucrose burst; }'],
      ['if kc_loop >= 2 { mitya burst; }'],
    ]);
    expect(t.counters).toEqual({ loop: true, cycles: [2, 3] });
    expect(translateRotation({ opener: 'Odette Q@1/2', loop: 'Odette E' }, mityaTeam, table).turns[0].error).toMatch(/only works in the Loop/);
  });

  it('explains misuse of ? and |', () => {
    expect(translateRotation(loop('Odette N3?'), mityaTeam, table).turns[0].error).toMatch(/single skill or burst/);
    expect(translateRotation(loop('Odette Q|E'), mityaTeam, table).turns[0].error).toMatch(/always happens/);
    expect(translateRotation(loop('Odette Q@3/2'), mityaTeam, table).turns[0].error).toMatch(/needs 1/);
  });

  it('passes "!" lines to gcsim unchanged, even with > in them', () => {
    const t = translateRotation(loop('Odette E\n! while .furina.energy > 50 { furina attack; }\nMitya Q'), mityaTeam, table);
    expect(t.ok).toBe(true);
    expect(t.turns.map((x) => x.statements)).toEqual([['odette skill;'], ['while .furina.energy > 50 { furina attack; }'], ['mitya burst;']]);
  });
});

describe('buildConfig with an opener and loop counters', () => {
  it('puts counters and the opener before the loop, and markers only in the timing config', () => {
    const result = buildConfig(
      team,
      data,
      { opener: 'Neuvillette tE', loop: 'Furina tE Q?@1/2 > Neuvillette C Q@2+' },
      table,
      DEFAULT_SETTINGS,
      100,
    );
    expect(result.problems).toEqual([]);
    const tail = lines(result.config!).slice(lines(result.config!).indexOf('active neuvillette;'));
    expect(tail).toEqual([
      'active neuvillette;',
      'let kc_loop = 0;',
      'let kc_c2 = 0;',
      'neuvillette skill;',
      'while 1 {',
      'kc_loop = kc_loop + 1;',
      'kc_c2 = kc_c2 + 1;',
      'if kc_c2 > 2 { kc_c2 = 1; }',
      'furina skill;',
      'if .furina.burst.ready && kc_c2 == 1 { furina burst; }',
      'neuvillette charge;',
      'if kc_loop >= 2 { neuvillette burst; }',
      '}',
    ]);
    expect(result.config).not.toContain('print(');
    expect(result.timingConfig).toContain('print("kc o1");');
    expect(result.timingConfig).toContain('print("kc l2");');
  });
});

describe('settings', () => {
  it('keeps values within limits and fills in missing ones', () => {
    expect(cleanSettings({ duration: -5, enemies: 9, enemyLevel: 100.4 })).toEqual({ ...DEFAULT_SETTINGS, duration: 1, enemies: 5 });
    expect(cleanSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});
