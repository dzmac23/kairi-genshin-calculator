# Genshin Theorycraft App: Project Plan

## Who this is for

The owner is an amateur Genshin Impact theorycrafter who is new to theorycrafting and to software projects. They use a Windows PC and a phone, think about teams and builds throughout the day, and value being able to see inside the numbers, which is why the project started as an Excel workbook. Explain decisions in plain language, ask before making large or irreversible choices, keep each session's changes small enough to review, and keep the README current so someone non-technical can follow what exists and how to use it.

## What we are building

An installable web app (a Progressive Web App) that runs on phone and PC, works offline after the first load, and runs real gcsim simulations inside the browser using gcsim's WebAssembly build. Nothing has to be installed on any device.

The app is primarily a set of purpose-built screens. It also has a sheet mode: a real spreadsheet with cells and editable formulas, opened when the owner wants to work something out by hand, with ready-made calculator templates and spreadsheet functions that read live data from the app.

These decisions were reached over a long planning conversation and should be treated as settled unless the owner says otherwise. gcsim is the single source of truth for rotation and team DPS; the app must not grow a second rotation engine that could disagree with it. The spreadsheet calculations in sheet mode are for single hits, comparisons and understanding, not for rotation DPS.

## Repository contents at handoff

`data/` holds the game and buff data described below. `scripts/` holds the prototype scripts that generated it (see `scripts/README.md`). `reference/` holds the original Excel workbook (`Genshin_Damage_Calculator.xlsx`, whose formulas are the source for the sheet-mode templates), the Excel macro that drove gcsim (`GcsimRunner.bas`), and a tested gcsim config and its result (`sample_gcsim_config.txt`, `sample_gcsim_result.json`).

## Technology

Use Vite with TypeScript and React. Use `vite-plugin-pwa` (or an equivalent) for the manifest, service worker and offline caching. Store history and settings in IndexedDB. Host on GitHub Pages, deployed by a GitHub Actions workflow; the owner will switch Settings → Pages → Source to "GitHub Actions" when told to.

gcsim's browser engine is not published as a release asset, so a GitHub Actions workflow must build it: check out `genshinsim/gcsim` at a pinned release tag (v2.49.6 at handoff), build `cmd/wasm` with `GOOS=js GOARCH=wasm`, and ship the resulting `.wasm` together with the matching Go `wasm_exec.js`. The wasm module registers these globals: `sample`, `validateConfig`, `initializeWorker`, `simulate`, `initializeAggregator`, `aggregate`, `flush`. Read `cmd/wasm/main.go`, and look at how gcsim's own web UI (in the genshinsim GitHub organisation) drives them, before designing the worker protocol. Run simulations in Web Workers so the UI stays responsive, and use several workers on multi-core devices. Expect phones to be slow; offer an iteration selector (100 for quick exploration, 500 or 1000 for numbers worth sharing).

The repository is public and licensed AGPL-3.0 because gcsim is AGPL-3.0. Any library added must be compatible with that (MIT, Apache-2.0, BSD and GPL-3.0 are fine). For sheet mode, HyperFormula (GPL-3.0) is the leading candidate for the formula engine; choose a grid UI after checking licence and mobile behaviour.

## Data files

`characters.json` has 129 playable characters (the seven Traveler elements are separate entries). Each entry has element, weapon type, rarity, ascension stat, gcsim key (null if gcsim does not support the character), which talent C3 and C5 boost, and stats at level keys `1, 20, 20+, 40, 40+, 50, 50+, 60, 60+, 70, 70+, 80, 80+, 90, 95, 100`. "80+" means ascended at level 80. Ascension values exclude the universal base 5% crit rate and 50% crit DMG, which every character has and which gcsim adds itself.

`weapons.json` has 246 weapons of 3 stars and up, with base ATK and substat at each level key, the passive template with `{0}`-style placeholders, the R1 to R5 values for those placeholders, and the gcsim key.

`artifact_sets.json` has 63 sets with 2-piece and 4-piece text and the gcsim key (low-rarity sets have none).

`talents.json` has 2,726 parsed talent rows. Each has the character, a display label such as `Q: Pyronado DMG` (prefix NA, E, Q or Sp), category, talent name, a kind (Damage, Heal/Shield, Buff/Other), scaling stat A and optional stat B, hits per use, status, per-level arrays `A`, `B` and `F` (flat) for levels 1 to 15, and the in-game text at levels 1 and 10. Multipliers are per hit; multi-part hits written as `a+b` are summed into one value and noted.

`buffs.json` has 1,023 buff entries and a list of 225 unparsed texts for manual review. Each buff has source type (Talent, Passive, Constellation, Weapon, Set), owner, item (A1, A4, C1 to C6, E, Q, Passive, 2pc, 4pc), stat (`ATK%`, `ATK`, `HP%`, `HP`, `DEF%`, `DEF`, `EM`, `CR`, `CD`, `ER`, `DMG%`, `Flat DMG`, `RES Shred`, `DEF Red`, `DEF Ignore`, or `Reaction:<name>`), attack filter, element filter (`Any`, `Elemental`, `Own` or an element), target (Self, Team, Others), basis (Fixed, Base ATK, ATK, HP, DEF, EM, ER, ER over 100%, CR), values (R1 to R5 for weapons), a talent key for talent-scaled buffs, default stacks, caps, default always-on, confidence and source text. Confidence is `Manual` (91, hand-checked), `Auto` (785, about three quarters fully correct in spot checks) or `Check` (147, unusual wording). Because gcsim applies buffs itself, this data is for the buff reference screen and sheet-mode templates, not for DPS.

`level_multipliers.json` is the reaction level multiplier table for levels 1 to 100 taken from gcsim. `reactions.json` has reaction coefficients and EM formulas. `gcsim_keys.json` maps display names to gcsim keys for characters, weapons and sets.

When the game updates, regenerate data from a newer genshin-db version using the scripts, and bump the pinned gcsim tag. Nine characters (Kachina, Linnea, Lohen, Mitya, Nefer, Sandrone, Valeriy, Vesna, Vodyanitsa) were not in gcsim v2.49.6; the app must warn and skip them rather than fail.

## Generating gcsim configs

`reference/sample_gcsim_config.txt` is a known-good config produced by the workbook; match its shape. For each team slot, emit a `char` line (`lvl=90/90 cons=0 talent=9,9,9`, using base talent levels capped at 10 because gcsim applies C3/C5 itself), an `add weapon` line, `add set` lines (`count=4`, or two `count=2` lines), and one `add stats` line with the artifact main stats and substats only (`atk% atk hp% hp def% def em cr cd er`, the element's DMG bonus such as `hydro%`, and `phys%`). Level keys convert as `X+` → `X/next cap` (`80+` → `80/90`), plain `X` → `X/X`, `95` → `95/100`, and `1` → `1/20`.

Then emit `options iteration=N duration=D swap_delay=12;`, one `target lvl=L resist=R radius=2 pos=...;` line per enemy, `energy every interval=480,720 amount=1;` when random particles are on, `active <first character>;`, and a `while 1 { ... }` block with one line per rotation turn, such as `furina skill, dash, burst;`.

Do not give the target an `hp=` value. With HP set, gcsim runs until the enemy dies instead of for the set duration; a huge HP value made test runs take hours of simulated time and get killed for running out of memory. Validate every config with the wasm `validateConfig` before running and show gcsim's error message to the user. Some actions have preconditions; for example `low_plunge` fails unless the character is airborne.

## Rotation notation

Rotations are entered the way the community writes them: `Neuvillette tE > Kazuha tE P > Furina tE d Q > Xilonen E N5 Q > Neuvillette C tE Q C2`, one turn per character. Tokens are space-separated. `E` and `tE` map to `skill`, `hE` to `skill[hold=1]`, `Q` to `burst`, `N` and `NA` to `attack`, `C` and `CA` to `charge`, `P` and `hP` to `high_plunge`, `lP` to `low_plunge`, `d` and `D` to `dash`, `j` and `J` to `jump`, and `w` to `walk`. A trailing number repeats the action (`N5` → `attack:5`, `C2` → `charge:2`), and `N2C` means `attack:2, charge`. Tokens that already look like gcsim (contain `:` or `[`, or are lowercase words of four or more letters) pass through unchanged. Character-specific overrides take priority over the general table. Show unknown tokens immediately while typing and keep the token table editable in the app. The example above is a good first test; gcsim reported that, as written, Neuvillette waits on his skill cooldown and Xilonen waits on burst energy, which the results screen should surface clearly.

## Phase 1: core loop

Build the app shell (installable, offline, phone-first layout that also works on desktop), the gcsim wasm build workflow, and four screens. Team has four slots with searchable pickers for character, level key, constellation, base talent levels, weapon, weapon level, refinement and sets, plus artifact stat entry, and shows computed stat totals. Rotation has the notation input with live translation preview and unknown-token warnings, and sim settings (iterations, duration, enemy level, enemy RES, number of enemies, random energy). Run validates, simulates with a progress indicator and can be cancelled. Results shows team DPS (mean, min, max, standard deviation), DPS and share per character, field time, ending energy, damage by source sorted high to low, reaction counts, and time lost to failed actions (skill cooldown, insufficient energy, insufficient stamina) with gcsim's warnings. Every run is saved to History in IndexedDB with team, rotation, settings and key numbers, and History can be exported and imported as a JSON file so the owner can move it between phone and PC.

Phase 1 is done when the example team in `reference/sample_gcsim_config.txt` (C0 Neuvillette, Kazuha, Furina, Xilonen, 500 iterations, 90 seconds) produces a config equivalent to the sample and a team DPS consistent with `reference/sample_gcsim_result.json` (about 35,100 mean with about 2,100 standard deviation), the app installs to a phone home screen, and a simulation runs with the phone in airplane mode.

## Phase 2: sheet mode

Add a spreadsheet view with real formulas, multiple sheets, and saving to IndexedDB, plus import and export of `.xlsx`. Provide templates ported from the reference workbook's Single Hit sheet: single-hit damage with every multiplier visible, crit value and crit ratio comparison, artifact substat comparison, reaction calculators (amplifying, catalyze, transformative), and the current team's buff values. Add custom functions that read the app's live state, for example `STAT(character, stat)`, `TALENT(character, label, level)` and `BUFF(owner, item)`, so templates fill themselves in from the current team.

The damage formula used throughout is: damage = (talent% × scaling stat + flat additive) × (1 + DMG bonus) × DEF multiplier × RES multiplier × amplifying multiplier × crit factor. DEF multiplier = (char level + 100) / ((char level + 100) + (enemy level + 100) × (1 − DEF reduction) × (1 − DEF ignore)). RES multiplier is 1 − RES/2 below zero, 1 − RES from 0 to 0.75, and 1/(4 × RES + 1) at 0.75 and above. Average crit factor is 1 + min(CR, 1) × CD. Total ATK = (character base ATK + weapon base ATK) × (1 + ATK%) + flat ATK, and HP and DEF follow the same pattern.

## Phase 3: polish

Add a buff reference screen that shows what the current team provides with values at the team's talent levels and refinements, shows the confidence level, and lets the owner correct entries and have the corrections persist. Then tune the phone layout, write a scripted data-update pipeline (genshin-db version bump, regenerate, diff), and a documented gcsim version-bump procedure. Cross-device history sync can come later and only if the owner wants it.

## Lessons from the prototype

Excel files written by scripts need the `_xlfn.` prefix on newer functions such as TEXTJOIN or Excel shows #NAME?. A buff or weapon equipped on two characters must produce two entries, one per slot; an early version only counted the first slot. Stat-scaled buffs need a clear order of evaluation; the prototype used each provider's stats before other temporary buffs. Element-conditional buffs such as Viridescent Venerer shred and Kazuha's A4 apply only to the swirled element, which a simple data model can overstate. Auto-parsed buff text needs human review before results are shared.
