import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { canChooseAscension, interpolateStats, levelCap, levelKey, levelToGcsim, parseLevel } from './level';
import { cleanSlot } from './model';

let data: GameData;
beforeAll(async () => {
  data = await loadGameData();
});

describe('levels and ascension', () => {
  it('reads any level, with the ascension it implies', () => {
    expect(parseLevel('81')).toEqual({ level: 81, ascension: 6 });
    expect(parseLevel('80')).toEqual({ level: 80, ascension: 5 });
    expect(parseLevel('80+')).toEqual({ level: 80, ascension: 6 });
    expect(parseLevel('75')).toEqual({ level: 75, ascension: 5 });
    expect(parseLevel('20')).toEqual({ level: 20, ascension: 0 });
    expect(parseLevel('21')).toEqual({ level: 21, ascension: 1 });
    expect(parseLevel('1')).toEqual({ level: 1, ascension: 0 });
    expect(parseLevel('95')).toEqual({ level: 95, ascension: 6 });
  });

  it('refuses levels out of range, and "ascended" where it is not a choice', () => {
    expect(parseLevel('0')).toBeUndefined();
    expect(parseLevel('101')).toBeUndefined();
    expect(parseLevel('91', 90)).toBeUndefined(); // weapons stop at 90
    expect(parseLevel('81+')).toBeUndefined();
    expect(parseLevel('eighty')).toBeUndefined();
  });

  it('lets only 20, 40, 50, 60, 70 and 80 be before or after ascending', () => {
    expect([20, 40, 50, 60, 70, 80].every(canChooseAscension)).toBe(true);
    expect([1, 19, 21, 81, 90, 100].some(canChooseAscension)).toBe(false);
    expect(levelKey(80, true)).toBe('80+');
    expect(levelKey(80, false)).toBe('80');
    expect(levelKey(81, true)).toBe('81'); // 81 is always after the final ascension
  });

  it('writes levels the way gcsim and the game do', () => {
    expect(levelToGcsim('81')).toBe('81/90');
    expect(levelToGcsim('80')).toBe('80/80');
    expect(levelToGcsim('80+')).toBe('80/90');
    expect(levelToGcsim('65')).toBe('65/70');
    expect(levelToGcsim('90')).toBe('90/90');
    expect(levelToGcsim('92')).toBe('92/100');
    expect(levelToGcsim('1')).toBe('1/20');
    expect(levelCap({ level: 40, ascension: 2 })).toBe(50);
  });

  it('keeps levels saved by earlier versions, and repairs nonsense', () => {
    expect(cleanSlot({ level: '80+', weaponLevel: '90' }).level).toBe('80+');
    expect(cleanSlot({ level: '81' }).level).toBe('81');
    expect(cleanSlot({ level: '81+' }).level).toBe('90');
    expect(cleanSlot({ weaponLevel: '95' }).weaponLevel).toBe('90');
  });

  it('estimates base stats between breakpoints, exact at the breakpoints', () => {
    const furina = data.character.get('Furina')!;
    const at = (k: string) => interpolateStats(furina.stats, k, ['base_hp', 'base_atk', 'base_def'])!;
    expect(at('80+').base_hp).toBe(furina.stats.find((s) => s.level === '80+')!.base_hp);
    const a80 = at('80+').base_hp!;
    const a90 = at('90').base_hp!;
    expect(at('81').base_hp!).toBeGreaterThan(a80);
    expect(at('81').base_hp!).toBeLessThan(a90);
    // 81/90 sits after the final ascension, between 80/90 and 90/90 (not between 80/80 and 80/90).
    expect(at('81').base_hp!).toBeCloseTo(a80 + (a90 - a80) / 10, 6);
  });
});
