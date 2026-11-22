import { beforeAll, describe, expect, it } from 'vitest';
import { loadGameData, type GameData } from '../data/gameData';
import { formatParam, loadLibrary, refinedPassive, scalingLines, type Library } from './library';

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

  it('writes talent scaling at any level exactly as the game does', () => {
    const at = (name: string, group: string, level: number) => Object.fromEntries(scalingLines(lib.scaling[name][group], level).map((l) => [l.label, l.value]));
    expect(at('Furina', 'Skill', 10)['Ousia Bubble DMG']).toBe('14.2% Max HP');
    expect(at('Furina', 'Skill', 1)['Ousia Bubble DMG']).toBe('7.9% Max HP');
    expect(at('Furina', 'Skill', 13)['Ousia Bubble DMG']).toBe('16.7% Max HP');
    // Jean's burst healing has a flat part that grows with the level too.
    expect(at('Jean', 'Burst', 1)['Continuous Regeneration']).toBe('25.12% ATK+154/s');
    expect(at('Jean', 'Burst', 10)['Continuous Regeneration']).toBe('45.22% ATK+339/s');
    // Hit counts stay as the game writes them.
    expect(at('Alhaitham', 'Skill', 1)['2-Mirror Projection Attack DMG']).toMatch(/×2$/);
    expect(at('Xiangling', 'Normal Attack', 1)['4-Hit DMG']).toMatch(/\*4$/);
  });

  it('formats values the way the game does', () => {
    expect(formatParam(4.248, 'P')).toBe('424.8%');
    expect(formatParam(0.25118, 'F2P')).toBe('25.12%');
    expect(formatParam(188.3, 'I')).toBe('188');
    expect(formatParam(15, 'F1')).toBe('15.0');
  });

  it("fills a weapon's passive with the refinement's values", () => {
    const absolution = data.weapon.get('Absolution')!;
    expect(refinedPassive(absolution, 1)).toMatch(/^CRIT DMG increased by \*\*20%\*\*/);
    expect(refinedPassive(absolution, 5)).toMatch(/^CRIT DMG increased by \*\*40%\*\*/);
  });
});

