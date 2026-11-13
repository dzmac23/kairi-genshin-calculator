import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characterName, reactionName, sourceName, summarize, type GcsimResult } from './summarize';

// gcsim's own result for the placeholder test team (C0 Neuvillette, Kazuha, Furina, Xilonen).
// Those builds were chosen for testing; they are not the owner's real builds.
const sample: GcsimResult = JSON.parse(readFileSync('reference/sample_gcsim_result.json', 'utf8'));
const view = summarize(sample);

describe('summarize (placeholder test team)', () => {
  it('reads team DPS, iterations and fight length', () => {
    expect(Math.round(view.teamDps.mean)).toBe(35126);
    expect(view.iterations).toBe(500);
    expect(view.duration).toBe(90);
  });

  it('lists the four characters with display names, elements and DPS shares that add up', () => {
    expect(view.characters.map((c) => c.name)).toEqual(['Neuvillette', 'Kaedehara Kazuha', 'Furina', 'Xilonen']);
    expect(view.characters.map((c) => c.element)).toEqual(['hydro', 'anemo', 'hydro', 'geo']);
    const totalShare = view.characters.reduce((sum, c) => sum + c.share, 0);
    expect(totalShare).toBeCloseTo(1, 2);
  });

  it('has field time and ending energy per character', () => {
    const neuv = view.characters[0];
    expect(neuv.fieldTime.mean).toBeCloseTo(46.64, 1);
    expect(neuv.fieldShare).toBeCloseTo(46.64 / 90, 2);
    expect(view.characters[1].endingEnergy?.mean).toBe(60);
  });

  it('sorts damage sources from highest to lowest', () => {
    expect(view.sources[0].source).toBe('Charged Attack: Equitable Judgment');
    expect(view.sources[0].character).toBe('Neuvillette');
    for (let i = 1; i < view.sources.length; i++) {
      expect(view.sources[i - 1].dps).toBeGreaterThanOrEqual(view.sources[i].dps);
    }
  });

  it('counts reactions per fight', () => {
    expect(view.reactions).toContainEqual({ reaction: 'Swirl (Hydro)', character: 'Kaedehara Kazuha', perFight: 6 });
    expect(view.reactions).toContainEqual({ reaction: 'Crystallize (Hydro)', character: 'Xilonen', perFight: 6 });
  });

  it("surfaces gcsim's warnings: Neuvillette's skill cooldown and the energy shortfall", () => {
    const kinds = view.warnings.map((w) => w.kind);
    expect(kinds).toEqual(['skill_cd', 'insufficient_energy']);
    const skill = view.warnings[0];
    expect(skill.rows[0].character).toBe('Neuvillette');
    expect(skill.rows[0].seconds.mean).toBeCloseTo(5.8, 1);
    const energy = view.warnings[1];
    expect(energy.rows.map((r) => r.character)).toEqual(['Xilonen', 'Neuvillette']);
  });

  it('lists time lost from largest to smallest, without zero rows', () => {
    // With these placeholder builds, Xilonen waits about 16 s per fight for burst energy.
    expect(view.timeLost[0]).toMatchObject({ kind: 'insufficient_energy', character: 'Xilonen' });
    expect(view.timeLost[0].seconds.mean).toBeCloseTo(16.4, 1);
    expect(view.timeLost.map((r) => r.character)).toEqual(['Xilonen', 'Neuvillette', 'Neuvillette']);
    expect(view.timeLost.every((r) => r.seconds.mean > 0)).toBe(true);
  });
});

describe('names', () => {
  it('turns gcsim keys into display names', () => {
    expect(characterName('kaedeharakazuha')).toBe('Kaedehara Kazuha');
    expect(characterName('someunknownkey')).toBe('Someunknownkey');
  });

  it('turns reaction keys into labels', () => {
    expect(reactionName('swirl-hydro')).toBe('Swirl (Hydro)');
    expect(reactionName('electrocharged')).toBe('Electro-Charged');
    expect(reactionName('hyperbloom')).toBe('Hyperbloom');
  });

  it("renames gcsim's \"Normal 0\" style sources, counting hits from 1", () => {
    expect(sourceName('Normal 0')).toBe('Normal Attack (hit 1)');
    expect(sourceName('Normal 3')).toBe('Normal Attack (hit 4)');
  });

  it('totals each reaction across the team', () => {
    const r = summarize({
      character_details: [{ name: 'furina' }, { name: 'skirk' }],
      statistics: {
        dps: { mean: 1, min: 1, max: 1, sd: 0 },
        source_reactions: [{ sources: { freeze: { mean: 3.3, min: 0, max: 0, sd: 0 } } }, { sources: { freeze: { mean: 39.3, min: 0, max: 0, sd: 0 } } }],
      },
    });
    expect(r.reactionTotals).toHaveLength(1);
    expect(r.reactionTotals[0].reaction).toBe('Freeze');
    expect(r.reactionTotals[0].perFight).toBeCloseTo(42.6);
    expect(r.reactionTotals[0].by.map((b) => b.character)).toEqual(['Skirk', 'Furina']);
  });

  it('labels reaction damage sources but leaves in-game attack names alone', () => {
    expect(sourceName('swirl-hydro')).toBe('Swirl (Hydro)');
    expect(sourceName('Charged Attack: Equitable Judgment')).toBe('Charged Attack: Equitable Judgment');
    expect(view.sources.some((s) => s.source === 'Swirl (Hydro)' && s.character === 'Kaedehara Kazuha')).toBe(true);
  });
});
