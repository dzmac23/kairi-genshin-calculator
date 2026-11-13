// Turns gcsim's raw result JSON into the rows the Results screen shows.
// Kept separate from the screen so it can be tested against reference/sample_gcsim_result.json.
//
// Field meanings come from gcsim's source (pkg/agg in genshinsim/gcsim). All "per fight" numbers
// are averages over the iterations; times are in seconds.

import gcsimKeys from '../../data/gcsim_keys.json';

export type Stat = { mean: number; min: number; max: number; sd: number };

type StatsBySource = { sources?: Record<string, Stat> };

/** The parts of gcsim's result JSON this file reads. Everything is optional to be safe. */
export type GcsimResult = {
  character_details?: { name: string; element?: string }[];
  incomplete_characters?: string[];
  statistics: {
    iterations?: number;
    duration?: Stat;
    dps: Stat;
    character_dps?: Stat[];
    field_time?: Stat[];
    end_stats?: { ending_energy?: Stat }[];
    source_dps?: StatsBySource[];
    source_reactions?: StatsBySource[];
    failed_actions?: Partial<Record<FailureKind, Stat>>[];
    warnings?: Partial<Record<FailureKind | 'target_overlap', boolean>>;
  };
};

export type FailureKind =
  | 'skill_cd'
  | 'insufficient_energy'
  | 'burst_cd'
  | 'insufficient_stamina'
  | 'swap_cd'
  | 'dash_cd';

/** Plain-English wording, based on gcsim's own warning text. */
export const FAILURES: Record<FailureKind, { label: string; warning: string; advice: string }> = {
  skill_cd: {
    label: 'Waiting for skill cooldown',
    warning: 'Waiting on Elemental Skill cooldown',
    advice: 'The rotation asks for a skill that is still on cooldown, so the character stands idle until it is ready.',
  },
  insufficient_energy: {
    label: 'Waiting for burst energy',
    warning: 'Waiting on energy for Elemental Burst',
    advice: 'The rotation asks for a burst before the character has enough energy, so they stand idle until it fills up.',
  },
  burst_cd: {
    label: 'Waiting for burst cooldown',
    warning: 'Waiting on Elemental Burst cooldown',
    advice: 'The rotation asks for a burst that is still on cooldown, so the character stands idle until it is ready.',
  },
  insufficient_stamina: {
    label: 'Waiting for stamina',
    warning: 'Waiting on stamina',
    advice: 'The rotation uses more stamina (charged attacks, dashes) than the character has, so they wait for it to refill.',
  },
  swap_cd: {
    label: 'Waiting for swap cooldown',
    warning: 'Waiting on character swap cooldown',
    advice: 'The rotation swaps characters faster than the swap cooldown allows.',
  },
  dash_cd: {
    label: 'Waiting for dash cooldown',
    warning: 'Waiting on dash cooldown',
    advice: 'The rotation dashes again before the dash cooldown has ended.',
  },
};
const FAILURE_ORDER = Object.keys(FAILURES) as FailureKind[];

export type CharacterRow = {
  key: string;
  name: string;
  element: string;
  dps: Stat;
  /** Share of team DPS, 0 to 1. */
  share: number;
  fieldTime: Stat;
  /** Share of the fight spent on field, 0 to 1. */
  fieldShare: number;
  endingEnergy?: Stat;
};

export type SourceRow = { character: string; element: string; source: string; dps: number; share: number };
export type ReactionRow = { reaction: string; character: string; perFight: number };
export type TimeLostRow = { kind: FailureKind; label: string; character: string; seconds: Stat };
export type WarningRow = {
  kind: FailureKind | 'target_overlap' | 'incomplete';
  title: string;
  advice: string;
  rows: { character: string; seconds: Stat }[];
};

export type ResultsView = {
  teamDps: Stat;
  iterations: number;
  duration: number;
  characters: CharacterRow[];
  sources: SourceRow[];
  reactions: ReactionRow[];
  timeLost: TimeLostRow[];
  warnings: WarningRow[];
};

const charNames = new Map(Object.entries(gcsimKeys.char).map(([name, key]) => [key, name]));

/** "kaedeharakazuha" -> "Kaedehara Kazuha", using data/gcsim_keys.json. */
export function characterName(key: string): string {
  return charNames.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const REACTION_NAMES: Record<string, string> = {
  electrocharged: 'Electro-Charged',
  lunarcharged: 'Lunar-Charged',
  lunarbloom: 'Lunar-Bloom',
  lunarcrystallize: 'Lunar-Crystallize',
  'freeze-extend': 'Freeze (extended)',
};

/** "swirl-hydro" -> "Swirl (Hydro)", "electrocharged" -> "Electro-Charged". */
export function reactionName(key: string): string {
  if (REACTION_NAMES[key]) return REACTION_NAMES[key];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const [reaction, element] = key.split('-');
  return element ? `${cap(reaction)} (${cap(element)})` : cap(reaction);
}

/**
 * Damage sources are mostly in-game names ("Charged Attack: Equitable Judgment"), but reaction
 * damage uses gcsim's reaction key ("swirl-hydro"). Give those a readable label too.
 */
export function sourceName(source: string): string {
  return /^[a-z]+(-[a-z]+)?$/.test(source) ? reactionName(source) : source;
}

const zero: Stat = { mean: 0, min: 0, max: 0, sd: 0 };

export function summarize(result: GcsimResult): ResultsView {
  const s = result.statistics;
  const details = result.character_details ?? [];
  const teamMean = s.dps.mean || 1;
  const duration = s.duration?.mean ?? 0;
  const names = details.map((c) => characterName(c.name));

  const characters: CharacterRow[] = details.map((c, i) => {
    const dps = s.character_dps?.[i] ?? zero;
    const fieldTime = s.field_time?.[i] ?? zero;
    return {
      key: c.name,
      name: names[i],
      element: c.element ?? 'physical',
      dps,
      share: dps.mean / teamMean,
      fieldTime,
      fieldShare: duration ? fieldTime.mean / duration : 0,
      endingEnergy: s.end_stats?.[i]?.ending_energy,
    };
  });

  const sources: SourceRow[] = details
    .flatMap((c, i) =>
      Object.entries(s.source_dps?.[i]?.sources ?? {}).map(([source, stat]) => ({
        character: names[i],
        element: c.element ?? 'physical',
        source: sourceName(source),
        dps: stat.mean,
        share: stat.mean / teamMean,
      })),
    )
    .filter((row) => row.dps > 0)
    .sort((a, b) => b.dps - a.dps);

  const reactions: ReactionRow[] = details
    .flatMap((_, i) =>
      Object.entries(s.source_reactions?.[i]?.sources ?? {}).map(([key, stat]) => ({
        reaction: reactionName(key),
        character: names[i],
        perFight: stat.mean,
      })),
    )
    .filter((row) => row.perFight > 0)
    .sort((a, b) => b.perFight - a.perFight);

  const timeLost: TimeLostRow[] = details
    .flatMap((_, i) =>
      FAILURE_ORDER.map((kind) => ({
        kind,
        label: FAILURES[kind].label,
        character: names[i],
        seconds: s.failed_actions?.[i]?.[kind] ?? zero,
      })),
    )
    .filter((row) => row.seconds.mean >= 0.005)
    .sort((a, b) => b.seconds.mean - a.seconds.mean);

  // gcsim raises a warning when the team loses 1 second or more per fight to a problem.
  const warnings: WarningRow[] = [];
  if (result.incomplete_characters?.length) {
    warnings.push({
      kind: 'incomplete',
      title: 'Some characters are still being finished in gcsim',
      advice: `${result.incomplete_characters.map(characterName).join(', ')} may not match the game exactly yet.`,
      rows: [],
    });
  }
  if (s.warnings?.target_overlap) {
    warnings.push({
      kind: 'target_overlap',
      title: 'Enemies are standing on top of each other',
      advice: 'Enemy positions overlap in at least one iteration, which can make results inaccurate.',
      rows: [],
    });
  }
  for (const kind of FAILURE_ORDER) {
    if (!s.warnings?.[kind]) continue;
    warnings.push({
      kind,
      title: FAILURES[kind].warning,
      advice: FAILURES[kind].advice,
      rows: timeLost.filter((r) => r.kind === kind).map((r) => ({ character: r.character, seconds: r.seconds })),
    });
  }

  return {
    teamDps: s.dps,
    iterations: s.iterations ?? 0,
    duration,
    characters,
    sources,
    reactions,
    timeLost,
    warnings,
  };
}
