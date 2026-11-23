import { describe, expect, it, vi } from 'vitest';

// The log saves to the device; here storage is a simple in-memory stand-in.
const saved = new Map<string, unknown>();
vi.mock('../storage', () => ({
  getItem: async (k: string) => saved.get(k),
  setItem: async (k: string, v: unknown) => void saved.set(k, structuredClone(v)),
}));

const { addProblem, problemReport, updateProblem } = await import('./log');

describe('the problem log', () => {
  it('keeps problems when one is updated later (the automatic check adds its answer)', async () => {
    const first = await addProblem({ kind: 'background', where: 'Setup', message: 'first' });
    const id = await addProblem({ kind: 'run', where: 'Run', message: 'a fight failed', setup: { rotation: { loop: 'Furina Q' } } });
    await updateProblem(id, { diagnosis: "Furina's burst isn't always ready in time." });
    const list = saved.get('problemLog') as { id: string; diagnosis?: string }[];
    expect(list.map((p) => p.id)).toEqual([id, first]);
    expect(list[0].diagnosis).toMatch(/Furina/);
  });

  it('writes a report with or without the setup', async () => {
    const id = await addProblem({ kind: 'run', where: 'Run', message: 'boom', details: 'after 3 of 1000', setup: { team: [{ character: 'Furina' }], config: 'furina char lvl=90/90;' } });
    const p = (saved.get('problemLog') as Parameters<typeof problemReport>[0][]).find((x) => x.id === id)!;
    const full = problemReport(p);
    expect(full).toMatch(/^Kairi Calc problem report\n\nWhat: Run stopped \(Run\)/);
    expect(full).toMatch(/App: test/);
    expect(full).toMatch(/Setup \(team, rotation, fight settings\):[\s\S]*Furina[\s\S]*gcsim config:\nfurina char/);
    expect(problemReport(p, false)).not.toMatch(/Furina/);
  });
});
