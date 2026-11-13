// Comparing two runs (Scenario A and Scenario B).
//
// The verdict accounts for randomness: each run's average DPS is only precise to about
// ±1.96 × spread ÷ √fights, so a difference smaller than the combined uncertainty is "too close to
// call". Fight settings are read from gcsim's results, so the fairness check works for every run,
// including pasted configs and runs imported from someone else.

import type { RunRecord } from '../history/model';
import { characterName, summarize, type GcsimResult, type ResultsView } from '../results/summarize';
import { ARTIFACT_STATS, type Slot } from '../team/model';

export type Verdict = 'b-better' | 'a-better' | 'too-close';

export type DpsComparison = {
  a: number;
  b: number;
  /** b − a */
  diff: number;
  /** diff ÷ a */
  pct: number;
  /** About 95% of the time, the true difference is within diff ± margin. */
  margin: number;
  verdict: Verdict;
};

export type CharacterDelta = {
  name: string;
  slotA: number;
  slotB: number;
  dpsA: number;
  dpsB: number;
  shareA: number;
  shareB: number;
  fieldA: number;
  fieldB: number;
  energyA?: number;
  energyB?: number;
};

export type SourceDelta = { character: string; slot: number; source: string; a: number; b: number; diff: number };
export type TimeLostDelta = { character: string; label: string; a: number; b: number; diff: number };

export type Comparison = {
  dps: DpsComparison;
  /** Differences that make the comparison unfair or worth knowing about. */
  fairness: string[];
  /** Same four characters (in any order). */
  sameTeam: boolean;
  /** What differs between the two runs' inputs (builds, rotation, settings). */
  changes: string[];
  characters: CharacterDelta[];
  sources: SourceDelta[];
  timeLost: TimeLostDelta[];
  timing?: { loopA?: number; loopB?: number; loopsA?: number; loopsB?: number; openerA?: number; openerB?: number };
  viewA: ResultsView;
  viewB: ResultsView;
};

type Settings = {
  simulator_settings?: { duration?: number; iterations?: number; delays?: { swap?: number } };
  energy_settings?: { active?: boolean; start?: number; end?: number; amount?: number };
  target_details?: { level?: number; resist?: Record<string, number> }[];
  sim_version?: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function compareDps(a: ResultsView, b: ResultsView): DpsComparison {
  const se = (v: ResultsView) => (v.iterations > 1 ? v.teamDps.sd / Math.sqrt(v.iterations) : 0);
  const diff = b.teamDps.mean - a.teamDps.mean;
  const margin = 1.96 * Math.sqrt(se(a) ** 2 + se(b) ** 2);
  return {
    a: a.teamDps.mean,
    b: b.teamDps.mean,
    diff,
    pct: a.teamDps.mean ? diff / a.teamDps.mean : 0,
    margin,
    verdict: Math.abs(diff) <= margin ? 'too-close' : diff > 0 ? 'b-better' : 'a-better',
  };
}

/** Fight settings that differ between the runs, as plain sentences. */
export function fairnessCheck(a: RunRecord, b: RunRecord): string[] {
  const sa = a.result as Settings;
  const sb = b.result as Settings;
  const out: string[] = [];
  const da = sa.simulator_settings?.duration;
  const db = sb.simulator_settings?.duration;
  if (da !== db) out.push(`Fight length differs: A is ${da} s, B is ${db} s.`);
  const ta = sa.target_details ?? [];
  const tb = sb.target_details ?? [];
  if (ta.length !== tb.length) out.push(`Number of enemies differs: A has ${ta.length}, B has ${tb.length}.`);
  const lvA = ta.map((t) => t.level).join(', ');
  const lvB = tb.map((t) => t.level).join(', ');
  if (ta.length === tb.length && lvA !== lvB) out.push(`Enemy level differs: A is ${lvA}, B is ${lvB}.`);
  const resA = JSON.stringify(ta.map((t) => t.resist ?? {}));
  const resB = JSON.stringify(tb.map((t) => t.resist ?? {}));
  if (ta.length === tb.length && resA !== resB) out.push('Enemy resistance differs.');
  const ea = sa.energy_settings?.active ?? false;
  const eb = sb.energy_settings?.active ?? false;
  if (ea !== eb) out.push(`Random energy is ${ea ? 'on' : 'off'} in A but ${eb ? 'on' : 'off'} in B.`);
  else if (ea && JSON.stringify(sa.energy_settings) !== JSON.stringify(sb.energy_settings)) out.push('Random energy settings differ.');
  if ((sa.simulator_settings?.delays?.swap ?? 12) !== (sb.simulator_settings?.delays?.swap ?? 12)) out.push('Swap delay differs.');
  const va = a.gcsimVersion ?? sa.sim_version?.slice(0, 7);
  const vb = b.gcsimVersion ?? sb.sim_version?.slice(0, 7);
  if (va && vb && va !== vb) out.push(`Made with different gcsim versions (A: ${va}, B: ${vb}); results can differ slightly between versions.`);
  return out;
}

function slotChanges(n: string, a: Slot, b: Slot): string[] {
  const out: string[] = [];
  if (a.level !== b.level) out.push(`${n}: level ${a.level} → ${b.level}`);
  if (a.constellation !== b.constellation) out.push(`${n}: C${a.constellation} → C${b.constellation}`);
  if (a.talents.join('/') !== b.talents.join('/')) out.push(`${n}: talents ${a.talents.join('/')} → ${b.talents.join('/')}`);
  if (a.weapon !== b.weapon) out.push(`${n}: weapon ${a.weapon ?? 'none'} → ${b.weapon ?? 'none'}`);
  else if (a.refinement !== b.refinement || a.weaponLevel !== b.weaponLevel) {
    out.push(`${n}: ${a.weapon} R${a.refinement} lv ${a.weaponLevel} → R${b.refinement} lv ${b.weaponLevel}`);
  }
  const sets = (s: Slot) =>
    s.sets.mode === '4pc' ? `4pc ${s.sets.set ?? '?'}` : s.sets.mode === '2+2' ? `2pc ${s.sets.first ?? '?'} + 2pc ${s.sets.second ?? '?'}` : 'no set';
  if (sets(a) !== sets(b)) out.push(`${n}: ${sets(a)} → ${sets(b)}`);
  for (const stat of ARTIFACT_STATS) {
    const va = a.artifacts[stat.key] ?? 0;
    const vb = b.artifacts[stat.key] ?? 0;
    if (Math.abs(va - vb) > 1e-9) out.push(`${n}: ${stat.label} ${r1(va)}${stat.percent ? '%' : ''} → ${r1(vb)}${stat.percent ? '%' : ''}`);
  }
  return out;
}

/** Simple line difference for pasted configs: lines only in A, lines only in B. */
function configChanges(a: string, b: string): string[] {
  const la = a.split('\n').map((l) => l.trim()).filter(Boolean);
  const lb = b.split('\n').map((l) => l.trim()).filter(Boolean);
  const isIterations = (l: string) => l.startsWith('options');
  const onlyA = la.filter((l) => !lb.includes(l) && !isIterations(l));
  const onlyB = lb.filter((l) => !la.includes(l) && !isIterations(l));
  return [...onlyA.map((l) => `A only: ${l}`), ...onlyB.map((l) => `B only: ${l}`)].slice(0, 30);
}

/** What differs between the two runs' inputs. */
export function inputChanges(a: RunRecord, b: RunRecord): string[] {
  const out: string[] = [];
  if (a.team && b.team) {
    for (let i = 0; i < 4; i++) {
      const sa = a.team[i];
      const sb = b.team[i];
      if (sa.character !== sb.character) out.push(`Slot ${i + 1}: ${sa.character ?? 'empty'} → ${sb.character ?? 'empty'}`);
      else if (sa.character) out.push(...slotChanges(sa.character, sa, sb));
    }
  }
  if (a.rotation && b.rotation) {
    if (a.rotation.opener.trim() !== b.rotation.opener.trim()) out.push(`Opener: "${a.rotation.opener.trim() || '(none)'}" → "${b.rotation.opener.trim() || '(none)'}"`);
    if (a.rotation.loop.trim() !== b.rotation.loop.trim()) out.push(`Loop: "${a.rotation.loop.trim()}" → "${b.rotation.loop.trim()}"`);
  }
  if (!(a.team && b.team && a.rotation && b.rotation) && a.config !== b.config) out.push(...configChanges(a.config, b.config));
  const ia = (a.result as Settings).simulator_settings?.iterations;
  const ib = (b.result as Settings).simulator_settings?.iterations;
  if (ia !== ib) out.push(`Simulated fights: ${ia} → ${ib}`);
  return out;
}

export function compareRuns(a: RunRecord, b: RunRecord): Comparison {
  const viewA = summarize(a.result as GcsimResult);
  const viewB = summarize(b.result as GcsimResult);
  const keysA = viewA.characters.map((c) => c.key);
  const keysB = viewB.characters.map((c) => c.key);
  const sameTeam = keysA.length === keysB.length && keysA.every((k) => keysB.includes(k));

  const characters: CharacterDelta[] = sameTeam
    ? viewA.characters.map((ca) => {
        const cb = viewB.characters.find((c) => c.key === ca.key)!;
        return {
          name: ca.name,
          slotA: ca.slot,
          slotB: cb.slot,
          dpsA: ca.dps.mean,
          dpsB: cb.dps.mean,
          shareA: ca.share,
          shareB: cb.share,
          fieldA: ca.fieldTime.mean,
          fieldB: cb.fieldTime.mean,
          energyA: ca.endingEnergy?.mean,
          energyB: cb.endingEnergy?.mean,
        };
      })
    : [];

  const sources: SourceDelta[] = [];
  if (sameTeam) {
    const key = (c: string, s: string) => `${c}|${s}`;
    const map = new Map<string, SourceDelta>();
    for (const s of viewA.sources) map.set(key(s.character, s.source), { character: s.character, slot: s.slot, source: s.source, a: s.dps, b: 0, diff: -s.dps });
    for (const s of viewB.sources) {
      const k = key(s.character, s.source);
      const prev = map.get(k);
      if (prev) map.set(k, { ...prev, b: s.dps, diff: s.dps - prev.a });
      else map.set(k, { character: s.character, slot: viewA.characters.find((c) => c.name === s.character)?.slot ?? s.slot, source: s.source, a: 0, b: s.dps, diff: s.dps });
    }
    sources.push(...[...map.values()].filter((d) => Math.abs(d.diff) >= 1).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)));
  }

  const lost = new Map<string, TimeLostDelta>();
  for (const r of viewA.timeLost) lost.set(`${r.character}|${r.kind}`, { character: r.character, label: r.label, a: r.seconds.mean, b: 0, diff: -r.seconds.mean });
  for (const r of viewB.timeLost) {
    const k = `${r.character}|${r.kind}`;
    const prev = lost.get(k);
    lost.set(k, prev ? { ...prev, b: r.seconds.mean, diff: r.seconds.mean - prev.a } : { character: r.character, label: r.label, a: 0, b: r.seconds.mean, diff: r.seconds.mean });
  }
  const timeLost = [...lost.values()].sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));

  const timing =
    a.timing || b.timing
      ? {
          loopA: a.timing?.loop?.mean,
          loopB: b.timing?.loop?.mean,
          loopsA: a.timing?.loopsPerFight,
          loopsB: b.timing?.loopsPerFight,
          openerA: a.timing?.opener?.mean,
          openerB: b.timing?.opener?.mean,
        }
      : undefined;

  return { dps: compareDps(viewA, viewB), fairness: fairnessCheck(a, b), sameTeam, changes: inputChanges(a, b), characters, sources, timeLost, timing, viewA, viewB };
}

/** One line for the verdict, e.g. "B is clearly better: +4.2% (+5,712 DPS)". */
export function verdictText(d: DpsComparison): string {
  const sign = d.diff >= 0 ? '+' : '−';
  const amount = `${sign}${Math.abs(d.pct * 100).toFixed(1)}% (${sign}${fmt(Math.abs(d.diff))} DPS)`;
  if (d.verdict === 'b-better') return `B is clearly better: ${amount}`;
  if (d.verdict === 'a-better') return `A is clearly better: B is ${amount}`;
  return `Too close to call: B is ${amount}, within the ±${fmt(d.margin)} that randomness alone could explain`;
}

export { characterName };
