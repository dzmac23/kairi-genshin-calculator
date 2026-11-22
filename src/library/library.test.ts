import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { loadLibrary, refinedPassive, scalingAt, type Library } from './library';

let lib: Library;
let data: GameData;
beforeAll(async () => {
  [lib, data] = await Promise.all([loadLibrary(), loadGameData()]);
});

describe('the Library', () => {
  it('has the written text for every character in the app', () => {
    for (const c of data.characters) {
      const t = lib.characters[c.name];
      expect(t, c.name).toBeDefined();
      expect(t.talents.length, c.name).toBeGreaterThanOrEqual(3);
      expect(t.constellations.map((k) => k.level), c.name).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect(lib.characters.Furina.constellations[0].text).toMatch(/When using \*\*Let the People Rejoice\*\*/);
    expect(lib.characters.Lauma.passives.map((p) => p.unlock)).toEqual(['Ascension 1', 'Ascension 4', 'Always', 'Always']);
  });

  it('writes talent scaling at any level the way the game does', () => {
    const row = lib.scaling.Furina.Skill.find((r) => r.label === 'Ousia Bubble DMG')!;
    expect(scalingAt(row, 10)).toEqual({ text: '14.2% Max HP', exact: true });
    expect(scalingAt(row, 1).text).toBe('7.9% Max HP');
    expect(scalingAt(row, 13).text).toBe('16.7% Max HP'); // 0.16711 in the game data
    const duration = lib.scaling.Furina.Skill.find((r) => r.label === 'Duration')!;
    expect(scalingAt(duration, 1).text).toBe('30s');
  });

  it("fills a weapon's passive with the refinement's values", () => {
    const absolution = data.weapon.get('Absolution')!;
    expect(refinedPassive(absolution, 1)).toMatch(/^CRIT DMG increased by \*\*20%\*\*/);
    expect(refinedPassive(absolution, 5)).toMatch(/^CRIT DMG increased by \*\*40%\*\*/);
  });
});

describe('talent scaling with several parts', () => {
  it('scales every part of a multi-hit by the row\'s curve and keeps hit counts', () => {
    const row = { label: '3-Hit DMG', at10: '67.6%+67.6%', values: [[0.7, 0.75, 0.8, 0.88, 0.94, 1.0, 1.1, 1.2, 1.25, 1.3512, 1.45, 1.55, 1.65, 1.75, 1.85]] };
    expect(scalingAt(row, 1)).toEqual({ text: '35.0%+35.0%', exact: true });
    const twice = { label: '3-Hit DMG', at10: '97.3%×2', values: [[0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.97288, 0, 0, 0, 0, 0]] };
    expect(scalingAt(twice, 1).text).toBe('50.0%×2');
  });
});
