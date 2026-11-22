// Energy Recharge targets: how much ER each character needs to burst every time the rotation asks.
//
// The engine (patches/wasm-energy.patch) plays fights in which bursts ignore energy, so the rotation
// runs exactly as written, and reports for every burst what the character received since their
// previous one: particle energy before Energy Recharge (by source), flat energy (by source), the
// burst's cost and their ER at that moment. Like gcsim's substat optimizer:
//
//   ER needed for a burst = (cost − flat energy) ÷ particle energy before ER   (at least 100%)
//
// The first burst of a fight is skipped (characters start with full energy). In each fight the
// worst burst sets the ER needed to burst every time; over many fights, "Average" is a typical
// fight, "Safe" a fight unluckier than 9 in 10, and "Worst case" the unluckiest.
//
// Lessons from the community's ER calculator spreadsheet, done by the simulation instead of by
// hand: particles from every teammate and enemy, on- and off-field, Favonius procs and flat energy
// from constellations and weapons, all from the rotation itself.

export type EnergyWindow = { frame: number; cost: number; er: number; raw: Record<string, number>; flat: Record<string, number> };
export type EnergyFight = { characters: { name: string; bursts: EnergyWindow[] }[] };

export type EnergyLevel = 'average' | 'safe' | 'worst';
export const ENERGY_LEVELS: { id: EnergyLevel; label: string; text: string }[] = [
  { id: 'average', label: 'Average', text: 'enough in a typical fight' },
  { id: 'safe', label: 'Safe', text: 'enough in 9 fights out of 10' },
  { id: 'worst', label: 'Worst case', text: 'enough even with the unluckiest particles' },
];

/** One source of a character's energy between bursts, on average. */
export type EnergySource = { source: string; amount: number; flat: boolean };

export type CharacterEnergy =
  | {
      key: string;
      status: 'target';
      /** ER needed (1.5 = 150%) at each level. */
      needed: Record<EnergyLevel, number>;
      /** Their ER when bursting (median). */
      yours: number;
      /** Seconds between the bursts measured (average). */
      interval: number;
      /** Bursts counted together: 2 = only every second burst written needs to be ready. */
      every: number;
      /** Fights in which some burst couldn't be ready at any ER (no particles at all). */
      impossible: number;
      sources: EnergySource[];
      /** Energy per measured interval: particle energy before ER, and flat energy. */
      perBurst: { particles: number; flat: number; cost: number };
    }
  /** Never bursts in the rotation. */
  | { key: string; status: 'no-burst' }
  /** Bursts at most once per fight: the fight is too short to measure a second burst. */
  | { key: string; status: 'once' }
  /** Their burst doesn't use energy (Skirk, Mavuika…). */
  | { key: string; status: 'no-energy' };

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** Joins every `every` windows into one: the energy over several written bursts for one real burst. */
function group(windows: EnergyWindow[], every: number): EnergyWindow[] {
  if (every <= 1) return windows;
  const out: EnergyWindow[] = [];
  for (let i = 0; i + every <= windows.length; i += every) {
    const part = windows.slice(i, i + every);
    const raw: Record<string, number> = {};
    const flat: Record<string, number> = {};
    for (const w of part) {
      for (const [k, v] of Object.entries(w.raw)) raw[k] = (raw[k] ?? 0) + v;
      for (const [k, v] of Object.entries(w.flat)) flat[k] = (flat[k] ?? 0) + v;
    }
    const last = part[part.length - 1];
    out.push({ frame: last.frame, cost: last.cost, er: last.er, raw, flat });
  }
  return out;
}

const neededFor = (w: EnergyWindow) => {
  const raw = sum(w.raw);
  const missing = w.cost - sum(w.flat);
  if (missing <= 0) return 1;
  return raw > 0 ? Math.max(1, missing / raw) : Infinity;
};

/**
 * Each character's ER target from the fights. `every` says, per gcsim key, how many written bursts
 * one real burst has to cover (default 1: every burst).
 */
export function energyTargets(fights: EnergyFight[], every: Record<string, number> = {}): CharacterEnergy[] {
  if (!fights.length) return [];
  return fights[0].characters.map((c, i): CharacterEnergy => {
    const key = c.name;
    const n = Math.max(1, every[key] ?? 1);
    const all = fights.map((f) => f.characters[i]?.bursts ?? []);
    if (all.every((b) => b.length === 0)) return { key, status: 'no-burst' };
    if (all.every((b) => b.every((w) => w.cost <= 0))) return { key, status: 'no-energy' };
    const windowsByFight = all.map((b) => group(b.slice(1), n));
    if (windowsByFight.every((w) => w.length === 0)) return { key, status: 'once' };

    const perFight: number[] = [];
    let impossible = 0;
    for (const windows of windowsByFight) {
      if (!windows.length) continue;
      const worst = Math.max(...windows.map(neededFor));
      if (Number.isFinite(worst)) perFight.push(worst);
      else impossible++;
    }
    perFight.sort((a, b) => a - b);
    const windows = windowsByFight.flat();
    const ers = windows.map((w) => w.er).sort((a, b) => a - b);
    const sources = new Map<string, EnergySource>();
    for (const w of windows) {
      for (const [k, v] of Object.entries(w.raw)) sources.set(`p:${k}`, { source: k, flat: false, amount: (sources.get(`p:${k}`)?.amount ?? 0) + v });
      for (const [k, v] of Object.entries(w.flat)) sources.set(`f:${k}`, { source: k, flat: true, amount: (sources.get(`f:${k}`)?.amount ?? 0) + v });
    }
    const intervals: number[] = [];
    for (const b of all) {
      if (!b.length) continue;
      // The time from the first burst to the next one counted (or group of them), and so on.
      const times = [b[0].frame, ...group(b.slice(1), n).map((w) => w.frame)];
      for (let j = 1; j < times.length; j++) intervals.push((times[j] - times[j - 1]) / 60);
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      key,
      status: 'target',
      needed: { average: percentile(perFight, 0.5), safe: percentile(perFight, 0.9), worst: percentile(perFight, 1) },
      yours: percentile(ers, 0.5),
      interval: avg(intervals),
      every: n,
      impossible,
      sources: [...sources.values()].map((s) => ({ ...s, amount: s.amount / windows.length })).filter((s) => Math.abs(s.amount) > 0.05).sort((a, b) => b.amount - a.amount),
      perBurst: { particles: avg(windows.map((w) => sum(w.raw))), flat: avg(windows.map((w) => sum(w.flat))), cost: avg(windows.map((w) => w.cost)) },
    };
  });
}

/**
 * The rough stand-in rotation used before a rotation is written, like the ER calculator spreadsheet's
 * defaults: each character uses their skill then their burst, and a rotation lasts 20 seconds (it
 * waits at the end if everyone is done sooner). In the app's own notation.
 */
export function standInRotation(names: string[]): { opener: string; loop: string } {
  return {
    opener: '! let kc_r = 0;',
    loop: ['! kc_r = kc_r + 1;', names.map((n) => `${n} E Q`).join(' > '), '! if f() < kc_r * 1200 { wait(kc_r * 1200 - f()); }'].join('\n'),
  };
}

/** How many fights the live targets use (enough for a stable "Safe"; each fight takes a few hundredths of a second). */
export const ENERGY_FIGHTS = 40;
