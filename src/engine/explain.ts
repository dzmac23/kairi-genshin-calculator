// Plain-English explanations of gcsim's error messages, shown under the message when a run stops.
// The patterns are gcsim's own messages (from its character code); the explanation says what
// happened and how to write the rotation instead. gcsim's message is always shown as well.

const EXPLANATIONS: { pattern: RegExp; text: string }[] = [
  {
    pattern: /need to use attack right before charge/i,
    text: 'This character can only use a Charged Attack straight after a Normal Attack of an unfinished combo (most swords and polearms, and a few others). After the last hit of a full combo, or after another move, write N1C (for example N5 N1C).',
  },
  { pattern: /Cannot use Scalespiker Cannon with (\d+) Nightsoul points/i, text: "Kinich's cannon needs a full 20-point bar. Write Fill before the E that fires it (E Fill E). Normally the app adds the Loop Shots by itself; this happens when the cannon is inside a choice like E/N3." },
  { pattern: /cannot use skill in seven-phase flash|skill cannot be used while in seven-phase flash/i, text: "Skirk can't use her skill during Seven-Phase Flash. Leave Flash first (it ends when she swaps out or runs out of Serpent's Subtlety)." },
  { pattern: /player must use low_plunge or high_plunge while airborne/i, text: "After a jump during Xianyun's burst the character is in the air, so the next move must be a plunge (J P)." },
  { pattern: /cannot low_plunge after skill/i, text: "Kazuha's plunge after his skill must be a high plunge: write P, not lP." },
  { pattern: /low_plunge can only be used after hold skill/i, text: 'Chiori can only low plunge right after a hold skill: hE lP.' },
  { pattern: /(low|high)_plunge can only be used (after charge or )?while airborne/i, text: "This character can only plunge while in the air, which needs Xianyun's burst (then J P), or their own special plunge." },
  { pattern: /only plunge after skill ends/i, text: 'This plunge only works right after the character ends their Nightsoul / Windfavored state with their skill.' },
  { pattern: /Cannot early cancel/i, text: 'After a shortened Charged Attack or burst, the next move must be a dash or jump (or skill/burst for Neuvillette). Add D before the next move, or remove the shortening option.' },
  { pattern: /Cannot use Skill Hold without Dew/i, text: "Lauma's hold skill needs a Verdant Dew (from Lunar-Bloom). Use tE, or make sure the team creates Dew first." },
  { pattern: /lauma spirit envoy/i, text: 'As a deer (after her Charged Attack) Lauma can only walk: no dash or jump.' },
  { pattern: /xilonen cannot (charge|low_plunge)/i, text: 'Xilonen has no Charged Attack or low plunge while skating in Nightsoul. End it with E first, or use Normal Attacks.' },
  { pattern: /in skill state/i, text: "Ayato can't use a Charged Attack or plunge during his skill. Use Normal Attacks (Shunsuiken) instead." },
  { pattern: /Cannot aim while in burst/i, text: "Sethos can't aim during his burst; his Normal Attacks become Dusk Bolts instead." },
  { pattern: /cannot use aim after n4/i, text: "Lyney can't aim right after his 4th Normal Attack. Use N3 Aim, or another move in between." },
  { pattern: /aim called when not in ranged stance/i, text: "Tartaglia can't aim in melee stance (after his E). Press E again to leave melee first." },
  { pattern: /charge called when not in melee stance/i, text: "Tartaglia's Charged Attack only exists in melee stance (after his E)." },
  { pattern: /jump in nightsoul blessing not implemented/i, text: "This character can't jump during their Nightsoul state in gcsim. End it with E first, or dash instead." },
  { pattern: /beams/i, text: "Sandrone fires 3 beams by default (6 at C1), and fewer when her Decoding Power is high. Lower the beam count: C(beams=2)." },
  { pattern: /cannot (walk|jump) during skill/i, text: "Sandrone can't walk or jump during her skill." },
  { pattern: /can't jump cancel burst kick/i, text: "Dehya can't jump during her burst kick." },
  { pattern: /key .+ is invalid for action/i, text: "This option isn't accepted by that move for this character. Check the option name in the character's notes (Rotation → Special characters) or remove it." },
  { pattern: /not implemented/i, text: "gcsim doesn't have this move for this character (for example a plunge or jump that was never measured). Remove it from the rotation." },
];

/** A plain-English explanation of a gcsim error, or undefined if there isn't one for it. */
export function explainGcsimError(message: string): string | undefined {
  return EXPLANATIONS.find((e) => e.pattern.test(message))?.text;
}
