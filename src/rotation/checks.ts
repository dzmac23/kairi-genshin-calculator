// Live checks on a rotation: moves that gcsim would stop on, make it wait, or that could be written
// better. Each rule is taken from gcsim's own code (paths in data/special_mechanics.json and
// data/gcsim_rules.json, from scripts/export_character_rules.mjs).
//
// The checks follow the moves in order, keeping track of each character's state (for example
// "Skirk is in Seven-Phase Flash") the way gcsim does: state carries on while the same character
// keeps acting, and ends when another character's turn swaps in. A conditional move (?, @, |) may or
// may not happen, so after one the state is unknown and no rule guesses.

import type { Move, Translation, Turn } from './notation';

export type CheckLevel = 'stop' | 'wait' | 'tip';

export type Check = { section: Turn['section']; index: number; level: CheckLevel; character: string; message: string };

/** From data/gcsim_rules.json. */
export type ChargeRule = { normals: number | null; charge: 'mid-combo' | 'not-after-full' | 'after-attack' | 'free' };

export type CheckMember = { key: string; name: string; constellation: number };

type State = {
  /** Normal Attacks in a row since the last other action; null when unknown. */
  attacks: number | null;
  flags: Map<string, boolean | null>;
  prev?: Move;
};

const PLUNGES = new Set(['high_plunge', 'low_plunge']);
const fresh = (): State => ({ attacks: 0, flags: new Map() });

export function checkRotation(translation: Translation, team: CheckMember[], rules: Map<string, ChargeRule>): Check[] {
  const checks: Check[] = [];
  const hasXianyun = team.some((m) => m.key === 'xianyun');
  const turns = translation.turns.filter((t) => !t.error);
  let current: { key: string; state: State } | undefined;
  // For "swapping while still in a state" warnings: the last turn of each character run.
  let lastTurn: Turn | undefined;

  const endRun = (next: Turn | undefined) => {
    if (!current || !lastTurn) return;
    const { key, state } = current;
    const name = lastTurn.member!.name;
    const swapWait = (flag: string, how: string) => {
      if (state.flags.get(flag) === true && next?.member && next.member.key !== key) {
        checks.push({ section: lastTurn!.section, index: lastTurn!.index, level: 'wait', character: name, message: `${name} is still in ${how} when the next character swaps in, so gcsim waits until it ends (up to about 10 s). End it with E first.` });
      }
    };
    if (key === 'chasca') swapWait('ns', 'her Nightsoul ride');
    if (key === 'ifa') swapWait('ns', 'his Nightsoul state');
    if (key === 'wanderer') swapWait('wf', 'Windfavored');
  };

  turns.forEach((turn, i) => {
    if (turn.raw) {
      // A gcsim statement: anything may happen, so whoever is acting is now in an unknown state.
      if (current) {
        current.state.attacks = null;
        for (const k of current.state.flags.keys()) current.state.flags.set(k, null);
      }
      return;
    }
    const member = turn.member;
    if (!member?.key || !turn.moves) return;
    if (!current || current.key !== member.key) {
      endRun(turn);
      current = { key: member.key, state: fresh() };
    }
    lastTurn = turn;
    const info = team.find((m) => m.key === member.key);
    const ctx = { checks, turn, name: member.name, key: member.key, cons: info?.constellation ?? 0, rule: rules.get(member.key), hasXianyun };
    for (const move of turn.moves) {
      const times = move.action === 'attack' ? 1 : Math.max(1, move.count);
      for (let n = 0; n < times; n++) applyMove(ctx, current.state, move);
      if (move.action === 'attack' && move.count > 1) {
        // A repeated attack adds the rest at once (each Normal Attack is the same for the rules).
        if (!move.conditional && current.state.attacks !== null) current.state.attacks += move.count - 1;
      }
    }
    // Mavuika's dash cancel needs a Charged Attack on both sides (C Dx C); otherwise gcsim dashes plainly.
    if (member.key === 'mavuika') {
      turn.moves.forEach((m, j) => {
        if (m.action !== 'dash' || !(m.params.charge_cancel > 0) || m.conditional) return;
        if (turn.moves![j - 1]?.action === 'charge' && turn.moves![j + 1]?.action === 'charge') return;
        const message = `Dx (dash cancel) only cancels between two of Mavuika's bike Charged Attacks (C D C or C Dx C); here gcsim does a plain dash.`;
        if (!checks.some((c) => c.section === turn.section && c.index === turn.index && c.message === message)) {
          checks.push({ section: turn.section, index: turn.index, level: 'tip', character: member.name, message });
        }
      });
    }
    // Look ahead: the next turn that acts (skipping "!" lines) decides whether this was a swap.
    if (i === turns.length - 1 || turns.slice(i + 1).every((t) => t.raw)) {
      const firstLoop = turns.find((t) => t.section === 'loop' && !t.raw);
      endRun(turn.section === 'loop' ? firstLoop : undefined);
    }
  });
  return checks;
}

type Ctx = {
  checks: Check[];
  turn: Turn;
  name: string;
  key: string;
  cons: number;
  rule?: ChargeRule;
  hasXianyun: boolean;
};

/** Fill (or its older names L and M): a whole gcsim loop that fills the bar. */
const isFill = (move: Move) => move.action === 'statement' && /^(fill|l|m)$/i.test(move.code);

function applyMove(ctx: Ctx, state: State, move: Move) {
  const { name, key } = ctx;
  const add = (level: CheckLevel, message: string) => {
    if (!ctx.checks.some((c) => c.section === ctx.turn.section && c.index === ctx.turn.index && c.message === message)) {
      ctx.checks.push({ section: ctx.turn.section, index: ctx.turn.index, level, character: name, message });
    }
  };
  // Not set yet means "not in that state": every character starts a turn after a swap in no state.
  const flag = (f: string) => (state.flags.has(f) ? state.flags.get(f) : false);
  const set = (f: string, v: boolean) => state.flags.set(f, move.conditional ? null : v);
  const a = move.action;
  const isSkill = a === 'skill';
  const held = isSkill && (move.params.hold ?? 0) > 0;
  const prev = state.prev;

  if (!move.conditional) {
    // --- Charged Attack rules (gcsim's NextQueueItemIsValid) ---
    if (a === 'charge' && ctx.rule && ctx.rule.normals && state.attacks !== null) {
      const special =
        (key === 'iansan' && flag('fast') !== false) ||
        (key === 'cyno' && flag('burst') !== false) ||
        (key === 'kinich' && flag('grapple')) ||
        (key === 'mualani' && flag('surf')) ||
        (key === 'xilonen' && flag('ns'));
      const n = ctx.rule.normals;
      const count = state.attacks;
      const full = count > 0 && count % n === 0;
      if (!special) {
        if (ctx.rule.charge === 'mid-combo' && (count === 0 || full)) {
          add(
            key === 'aratakiitto' ? 'tip' : 'stop',
            count === 0
              ? `${name} can only use a Charged Attack straight after a Normal Attack of an unfinished combo; here it comes after another move, so gcsim stops the run. Write N1C (or more Normal Attacks first).`
              : `${name}'s combo has ${n} hits, so after N${count} the combo is finished and a Charged Attack isn't allowed: gcsim stops the run. Write N${count} N1C, or end the combo earlier (N${count - 1}C).`,
          );
        } else if (ctx.rule.charge === 'not-after-full' && full) {
          add(key === 'aratakiitto' ? 'tip' : 'stop', `${name}'s combo has ${n} hits; a Charged Attack straight after the last one stops the run in gcsim. Use N${count - 1}C, or another move in between.`);
        } else if (ctx.rule.charge === 'after-attack' && count === 0) {
          add('stop', `${name} can only use a Charged Attack straight after a Normal Attack; gcsim stops the run here. Put N1 before it.`);
        }
      }
    }

    // --- Plunges need Xianyun (or a character's own special plunge) ---
    if (PLUNGES.has(a) && !ctx.hasXianyun) {
      const afterSkill = prev?.action === 'skill' && !prev.conditional;
      const ok =
        (key === 'kaedeharakazuha' && a === 'high_plunge' && afterSkill) ||
        (key === 'gaming' && afterSkill) ||
        (key === 'alhaitham' && a === 'low_plunge' && afterSkill && (prev!.params.hold ?? 0) > 0) ||
        (key === 'chiori' && a === 'low_plunge' && afterSkill && (prev!.params.hold ?? 0) > 0) ||
        (key === 'varesa' && a === 'high_plunge' && prev?.action === 'charge') ||
        (key === 'xianyun' && flag('skill') !== false) ||
        (['ifa', 'chasca', 'wanderer'].includes(key) && a === 'low_plunge' && afterSkill) ||
        key === 'mavuika' ||
        key === 'nefer';
      if (!ok) {
        if (key === 'kaedeharakazuha' && a === 'low_plunge' && afterSkill) add('stop', `Kazuha's plunge after his skill must be a high plunge: use P, not lP (gcsim stops the run).`);
        else if (key === 'chiori' && a === 'low_plunge') add('stop', `Chiori can only low plunge right after a hold skill (hE lP); gcsim stops the run otherwise.`);
        else add('stop', `${name} can only plunge while airborne, which needs Xianyun's burst (then J P) — and there's no Xianyun in this team. gcsim stops the run.`);
      }
    }
    if (key === 'nefer' && PLUNGES.has(a)) add('stop', `Nefer has no plunge in this app's gcsim (its timings were never counted), so gcsim stops the run.`);
  }

  // --- Character rules ---
  switch (key) {
    case 'mavuika':
      // Hold skill = the bike, tap = the ring; a recast switches between them.
      // Not knowing (after a swap, a ? move or a recast from an unknown form) gives no tip.
      if (isSkill) {
        const now = state.flags.get('bike');
        const recast = (move.params.recast ?? 0) > 0;
        state.flags.set('bike', move.conditional ? null : recast ? (typeof now === 'boolean' ? !now : null) : held);
      } else if (a === 'dash' && (move.params.charge_cancel ?? 0) > 0 && state.flags.get('bike') === false && !move.conditional) {
        add('tip', `Dx (dash cancel) only exists on Mavuika's bike (after hE); here she's on her ring, so it's a plain dash.`);
      } else if (a === 'charge' && (move.params.final ?? 0) > 0 && state.flags.get('bike') === false && !move.conditional) {
        add('tip', `F (Finisher) only exists on Mavuika's bike (after hE); here she's on her ring, so it's an ordinary Charged Attack.`);
      }
      break;
    case 'skirk':
      if (isSkill) {
        if (flag('flash') === true && !move.conditional) add('stop', `Skirk can't use her skill during Seven-Phase Flash: gcsim stops the run. Leave Flash first (it ends when she swaps out or runs out of Serpent's Subtlety).`);
        if (!held) set('flash', true);
      }
      break;
    case 'kinich':
      if (isSkill) {
        if (flag('grapple') === true) {
          // A bar that isn't full yet is topped up with Loop Shots automatically (see notation.ts).
          if (held && !move.conditional) add('tip', `Fire Kinich's cannon with a plain E: gcsim makes a held cannon 18 frames faster than it really is.`);
          set('full', false);
        } else {
          set('grapple', true);
          set('full', false);
        }
      } else if (isFill(move)) {
        if (flag('grapple') === false) add('tip', `Fill only works while Kinich is grappling (after his E); here it does nothing.`);
        set('full', true);
      } else if ((a === 'charge' || PLUNGES.has(a)) && flag('grapple') === true && !move.conditional) {
        add('stop', `No Charged Attack or plunge while Kinich is grappling: gcsim stops the run.`);
      }
      break;
    case 'mualani':
      if (isSkill) {
        const surfing = flag('surf');
        set('surf', surfing === true ? false : true);
        set('stacks', false);
      } else if (isFill(move)) {
        if (flag('surf') === false) add('tip', `Fill only works while Mualani is surfing (after her E); here it does nothing.`);
        set('stacks', true);
      } else if (a === 'attack' && flag('surf') === true) {
        if (flag('stacks') === false && !move.conditional) add('tip', `This bite has fewer than 3 stacks (a weak bite). Put Fill before it to surf until 3 stacks for the Surging Bite (E Fill N).`);
        set('stacks', false);
      } else if (a === 'charge' && flag('surf') === true && !move.conditional) {
        add('stop', `No Charged Attack while Mualani is surfing: gcsim stops the run.`);
      }
      break;
    case 'xilonen':
      if (isSkill) set('ns', flag('ns') === true ? false : true);
      else if ((a === 'charge' || a === 'low_plunge') && flag('ns') === true && !move.conditional) add('stop', `No Charged Attack or low plunge while Xilonen is in Nightsoul: gcsim stops the run.`);
      break;
    case 'kamisatoayato':
      if (isSkill) set('skill', true);
      else if ((a === 'charge' || PLUNGES.has(a)) && flag('skill') === true && !move.conditional) add('stop', `No Charged Attack or plunge during Ayato's skill: gcsim stops the run.`);
      break;
    case 'sethos':
      if (a === 'burst') set('burst', true);
      else if (a === 'aim' && flag('burst') === true && !move.conditional) add('stop', `Sethos can't aim during his burst: gcsim stops the run.`);
      break;
    case 'lyney':
      if (a === 'aim' && prev?.action === 'attack' && state.attacks !== null && state.attacks > 0 && state.attacks % 4 === 0 && !move.conditional) {
        add('stop', `Lyney can't aim right after his 4th Normal Attack: gcsim stops the run.`);
      }
      break;
    case 'tartaglia':
      if (isSkill) set('melee', flag('melee') === true ? false : true);
      else if (a === 'aim' && flag('melee') === true && !move.conditional) add('stop', `Tartaglia can't aim in melee stance: gcsim stops the run.`);
      else if (a === 'charge' && flag('melee') === false && !move.conditional) add('stop', `Tartaglia's Charged Attack only exists in melee stance (after his E): gcsim stops the run.`);
      break;
    case 'lauma':
      if (held && !move.conditional) add('tip', `Lauma's hold skill needs a Verdant Dew; without one gcsim stops the run.`);
      if (a === 'charge') set('deer', true);
      else if ((a === 'dash' || a === 'jump') && flag('deer') === true && !move.conditional) add('stop', `Lauma can't dash or jump as a deer (after her Charged Attack): gcsim stops the run.`);
      else if (a !== 'walk') set('deer', false);
      break;
    case 'chasca':
    case 'ifa':
      if (isSkill) set('ns', flag('ns') === true ? false : true);
      else if (a === 'jump' && flag('ns') === true && !move.conditional) add('stop', `${name} can't jump in Nightsoul: gcsim stops the run.`);
      break;
    case 'wanderer':
      if (isSkill) set('wf', flag('wf') === true ? false : true);
      break;
    case 'yumemizukimizuki':
      if (isSkill) set('dd', flag('dd') === true ? false : true);
      else if (['attack', 'charge', 'jump', 'aim'].includes(a) && flag('dd') === true && !move.conditional) add('wait', `During Dreamdrifter, Mizuki can only dash, walk, burst or cancel with E; this move makes gcsim wait until Dreamdrifter ends.`);
      break;
    case 'xianyun':
      if (isSkill) set('skill', true);
      else if ((a === 'attack' || a === 'charge') && flag('skill') === true && !move.conditional) add('wait', `Normal and Charged Attacks wait until Xianyun's skill state ends; plunge (P) to use it.`);
      else if (PLUNGES.has(a)) set('skill', false);
      break;
    case 'neuvillette':
      if (flag('short') === true && ['attack', 'charge', 'walk'].includes(a) && !move.conditional) add('stop', `After a shortened Charged Attack, Neuvillette's next move can't be a Normal Attack, Charged Attack or walk: gcsim stops the run. Dash, jump, skill or burst first.`);
      set('short', a === 'charge' && move.params.ticks !== undefined);
      break;
    case 'sigewinne':
      if (flag('short') === true && ['attack', 'aim', 'skill', 'burst', 'walk'].includes(a) && !move.conditional) add('stop', `After a shortened burst, Sigewinne's next move must be a dash or jump: gcsim stops the run.`);
      set('short', a === 'burst' && move.params.ticks !== undefined);
      break;
    case 'sandrone': {
      const max = ctx.cons >= 1 ? 6 : 3;
      if (a === 'charge' && (move.params.beams ?? 0) > max && !move.conditional) add('stop', `Sandrone can fire at most ${max} beams${ctx.cons >= 1 ? ' (C1)' : ''}; more stops the run in gcsim.`);
      break;
    }
    case 'jean':
      if (ctx.cons >= 1 && held && (move.params.hold ?? 0) < 60 && !move.conditional) add('tip', `Jean's C1 needs a hold of at least 60 frames; write hE(60) to trigger it.`);
      break;
    case 'kirara':
    case 'sayu':
      if (move.code === 'hE' && !move.conditional) add('tip', `${name}'s hE is a 1-frame timed hold, not her short hold. For the short hold, write sE.`);
      break;
    case 'iansan':
      if (isSkill) set('fast', true);
      else if (a === 'charge' || a === 'attack') set('fast', false);
      break;
    case 'cyno':
      if (a === 'burst') set('burst', true);
      break;
  }

  // Normal Attack counter: any other move restarts the combo (gcsim pkg/core/player/exec.go).
  if (move.conditional || a === 'statement') state.attacks = null;
  else state.attacks = a === 'attack' ? (state.attacks === null ? null : state.attacks + 1) : 0;
  state.prev = move;
}
