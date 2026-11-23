// The problem log: the last few errors the app hit, kept on this device (never sent anywhere), so
// they can be copied or saved as a report and sent to whoever looks into it. Works offline.
//
// Three kinds of problems are recorded:
//   screen      a screen crashed (caught by ErrorBoundary)
//   run         a simulation stopped with an error (gcsim's message, plus the automatic check of why)
//   background  any other unexpected error (window error and unhandled promise rejection events)
// Each keeps the time, where it happened, the message and technical details, the app and gcsim
// versions, the device, and the team, rotation and fight settings at the time (left out of a report
// on request).

import { useEffect, useState } from 'react';
import { getItem, setItem } from '../storage';

export type ProblemKind = 'screen' | 'run' | 'background';
export type ProblemSetup = { team?: unknown; rotation?: unknown; settings?: unknown; config?: string };
export type Problem = {
  id: string;
  time: string;
  kind: ProblemKind;
  /** Where it happened: a screen, or "Run". */
  where: string;
  message: string;
  /** Technical details: the error's stack, how far a run got… */
  details?: string;
  app: string;
  gcsim?: string;
  device: string;
  setup?: ProblemSetup;
  /** The automatic check of why a run failed (problems/diagnose.ts). */
  diagnosis?: string;
};

const KEY = 'problemLog';
const MAX = 20;

let problems: Problem[] | undefined;
let loading: Promise<Problem[]> | undefined;
const listeners = new Set<(p: Problem[]) => void>();

/** The current list (loaded from the device the first time). */
async function load(): Promise<Problem[]> {
  loading ??= getItem<Problem[]>(KEY).then((saved) => (problems = Array.isArray(saved) ? saved : []));
  await loading;
  // The list as it is now, not as it was first loaded: it changes as problems are added.
  return problems!;
}
async function save(next: Problem[]) {
  problems = next.slice(0, MAX);
  listeners.forEach((l) => l(problems!));
  await setItem(KEY, problems);
}

/** What the app was doing, for problems that don't know it themselves (set by App). */
let context: () => { screen?: string; setup?: ProblemSetup; gcsim?: string } = () => ({});
export function setProblemContext(get: typeof context) {
  context = get;
}

const appBuild = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';
const device = () => (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');

/** Records a problem and returns its id. The same message twice within 10 s is recorded once. */
export async function addProblem(p: Omit<Problem, 'id' | 'time' | 'app' | 'device'> & Partial<Pick<Problem, 'device'>>): Promise<string> {
  const list = await load();
  const recent = list.find((x) => x.message === p.message && x.where === p.where && Date.now() - Date.parse(x.time) < 10_000);
  if (recent) return recent.id;
  const ctx = context();
  const problem: Problem = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
    time: new Date().toISOString(),
    app: appBuild,
    device: device(),
    gcsim: ctx.gcsim,
    setup: ctx.setup,
    ...p,
  };
  await save([problem, ...list]);
  return problem.id;
}

export async function updateProblem(id: string, patch: Partial<Problem>) {
  const list = await load();
  await save(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}
export async function removeProblem(id: string) {
  await save((await load()).filter((p) => p.id !== id));
}
export async function clearProblems() {
  await save([]);
}

/** The problem log for a screen (newest first); updates as problems are added. */
export function useProblems(): Problem[] {
  const [list, setList] = useState<Problem[]>(problems ?? []);
  useEffect(() => {
    listeners.add(setList);
    load().then(setList);
    return () => void listeners.delete(setList);
  }, []);
  return list;
}

/** Catches errors nothing else caught (call once at start). */
export function catchUnhandledErrors() {
  if (typeof window === 'undefined') return;
  const record = (error: unknown, fallback: string) => {
    const e = error instanceof Error ? error : undefined;
    void addProblem({ kind: 'background', where: context().screen ?? 'app', message: e?.message ?? (String(error ?? '') || fallback), details: e?.stack });
  };
  window.addEventListener('error', (event) => record(event.error ?? event.message, 'Unknown error'));
  window.addEventListener('unhandledrejection', (event) => record(event.reason, 'Unknown error in the background'));
}

const KIND_NAME: Record<ProblemKind, string> = { screen: 'Screen crashed', run: 'Run stopped', background: 'Unexpected error' };

/** A plain-text report to copy or save. `withSetup` adds the team, rotation and fight settings. */
export function problemReport(p: Problem, withSetup = true): string {
  const lines = [
    'Kairi Calc problem report',
    '',
    `What: ${KIND_NAME[p.kind]} (${p.where})`,
    `When: ${new Date(p.time).toLocaleString()}`,
    `App: ${p.app}${p.gcsim ? ` · gcsim ${p.gcsim}` : ''}`,
    `Device: ${p.device}`,
    '',
    'Message:',
    p.message,
  ];
  if (p.diagnosis) lines.push('', 'Automatic check:', p.diagnosis);
  if (p.details) lines.push('', 'Details:', p.details);
  if (withSetup && p.setup) {
    const { config, ...rest } = p.setup;
    lines.push('', 'Setup (team, rotation, fight settings):', JSON.stringify(rest, null, 1));
    if (config) lines.push('', 'gcsim config:', config);
  }
  return lines.join('\n');
}

export const reportFileName = (p: Problem) => `kairi-problem-${p.time.slice(0, 19).replace(/[:T]/g, '-')}.txt`;
