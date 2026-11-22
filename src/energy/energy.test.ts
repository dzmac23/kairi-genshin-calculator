import { describe, expect, it } from 'vitest';
import { energyTargets, type EnergyFight, type EnergyWindow } from './energy';

const w = (frame: number, raw: Record<string, number>, flat: Record<string, number> = {}, cost = 60, er = 1.5): EnergyWindow => ({ frame, cost, er, raw, flat });
const fight = (...bursts: EnergyWindow[][]): EnergyFight => ({ characters: bursts.map((b, i) => ({ name: `c${i}`, bursts: b })) });

describe('Energy Recharge targets', () => {
  it('needs (cost − flat) ÷ particle energy, skipping the first burst and taking the worst one', () => {
    // First burst ignored (full energy at the start); then 40 and 30 raw particle energy: 60/40 = 150%, 60/30 = 200%.
    const [c] = energyTargets([fight([w(100, { x: 99 }), w(1300, { self: 40 }), w(2500, { self: 20, other: 10 })])]);
    expect(c.status).toBe('target');
    if (c.status !== 'target') return;
    expect(c.needed.average).toBeCloseTo(2);
    expect(c.interval).toBeCloseTo(20);
    expect(c.yours).toBe(1.5);
    expect(c.sources.map((s) => s.source)).toEqual(['self', 'other']);
  });

  it('subtracts flat energy and never asks for less than 100%', () => {
    const [c] = energyTargets([fight([w(0, {}), w(1200, { self: 30 }, { weapon: 15 })])]); // (60-15)/30 = 150%
    expect(c.status === 'target' && c.needed.average).toBeCloseTo(1.5);
    const [d] = energyTargets([fight([w(0, {}), w(1200, { self: 90 })])]);
    expect(d.status === 'target' && d.needed.average).toBe(1);
  });

  it('Average, Safe and Worst case come from the spread over fights', () => {
    const fights = Array.from({ length: 10 }, (_, i) => fight([w(0, {}), w(1200, { self: 60 / (1 + i / 10) })])); // 100%…190%
    const [c] = energyTargets(fights);
    if (c.status !== 'target') throw new Error(c.status);
    expect(c.needed.average).toBeCloseTo(1.4);
    expect(c.needed.safe).toBeCloseTo(1.8);
    expect(c.needed.worst).toBeCloseTo(1.9);
  });

  it('can count only every second written burst ("bursts every 2 rotations")', () => {
    const bursts = [w(0, {}), w(1200, { self: 30 }), w(2400, { self: 30 })]; // alone 200%; two together 60/60 = 100%
    expect(energyTargets([fight(bursts)], { c0: 2 })[0]).toMatchObject({ needed: { average: 1 }, interval: 40, every: 2 });
  });

  it('says when a character never bursts, bursts once, or uses no energy', () => {
    expect(energyTargets([fight([], [w(0, {})], [w(0, {}, {}, 0), w(1200, {}, {}, 0)])]).map((c) => c.status)).toEqual(['no-burst', 'once', 'no-energy']);
  });
});
