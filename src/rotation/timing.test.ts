import { describe, expect, it } from 'vitest';
import type { Turn } from './notation';
import { measureTiming } from './timing';

const turn = (section: Turn['section'], index: number, text: string): Turn => ({ section, index, text, tokens: [], statements: ['x;'] });
const turns = [turn('opener', 1, 'Skirk hE'), turn('loop', 1, 'Furina Q'), turn('loop', 2, 'Shenhe hE@2/2')];
const m = (frame: number, msg: string) => ({ frame, msg });

describe('measureTiming', () => {
  // Opener 0-60; loops start at 60, 360, 720; the fight ends at 900 (the third loop is cut off).
  // Shenhe's turn is skipped (0 frames) in loop 1 and takes 120 frames in loop 2.
  const replay = {
    endFrame: 900,
    markers: [m(0, 'kc o1'), m(60, 'kc l1'), m(360, 'kc l2'), m(360, 'kc l1'), m(600, 'kc l2'), m(720, 'kc l1'), m(800, 'kc l2'), m(5, 'something else')],
  };
  const t = measureTiming([replay], turns);

  it('measures the opener and complete loops only', () => {
    expect(t.opener).toEqual({ mean: 1, min: 1, max: 1 });
    expect(t.loop).toEqual({ mean: 5.5, min: 5, max: 6 });
    expect(t.loopsPerFight).toBeCloseTo(840 / 330);
  });

  it('times each turn and counts the loops it was skipped', () => {
    expect(t.turns.map((x) => [x.text, x.time?.mean, x.measured, x.skipped])).toEqual([
      ['Skirk hE', 1, 1, 0],
      ['Furina Q', 4.5, 2, 0],
      ['Shenhe hE@2/2', 1, 2, 1],
    ]);
  });

  it('copes with a loop that never finishes within the fight', () => {
    const long = measureTiming([{ endFrame: 300, markers: [m(0, 'kc l1'), m(100, 'kc l2')] }], turns);
    expect(long.loop).toBeUndefined();
    expect(long.turns[1].measured).toBe(0);
  });
});
