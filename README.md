# Kairi Genshin Calculator

A Genshin Impact theorycrafting app that runs real [gcsim](https://github.com/genshinsim/gcsim) simulations on your phone or PC, in the browser, with nothing to install. It can be added to your home screen and works offline. See `PROJECT_PLAN.md` for the full plan.

## Status

**Phase 1 is complete.** The app is usable on phone and PC: build a team, write a rotation, run real gcsim simulations on the device (also offline), read and compare the results, and keep everything in a history you can back up and move between devices.

Phase 1 acceptance checks from `PROJECT_PLAN.md` (run in a phone-sized browser and by the automatic tests):

| Check | Result |
| --- | --- |
| The placeholder test team, entered on the Setup screen with the plan's rotation and default settings, produces a config equivalent to `reference/sample_gcsim_config.txt` | Identical (also an automatic test) |
| Team DPS consistent with `reference/sample_gcsim_result.json` (about 35,100 mean, about 2,100 standard deviation) | 35,124 mean, 2,014 sd at 500 fights (gcsim's own: 35,126) |
| The app installs to a phone home screen | The browser's own installability check reports no problems (manifest, icons, offline worker) |
| A simulation runs with the phone in airplane mode | Yes: on the owner's phone (Step 1 and Step 2 checks) and in the automated offline test |

## What the app does

In the order you use it (the Home screen has the same steps with buttons):

1. **Setup** (the team and its rotation on one screen):
   - **Now simulating** bar at the top (also on Run), for quick swaps: shows the loaded saved team and rotation. Tap **Switch**, choose a team, then one of that team's saved rotations (the main one is listed first, marked ★).
   - **Switching inside the sections:** the Team section has a **Saved team** picker (loads the team with its main rotation) and the Rotation section shows the loaded team's saved rotations as chips (★ = main). Before anything unsaved is replaced, the app asks: **Save changes and switch** (for edits to a saved team or rotation), **Switch without saving** or **Cancel**. The bar works the same way.
   - **Saving:** a team is always saved together with a rotation, which becomes its **main rotation**. Team saving lives in the Team section (**Save changes to team**, **Save as new team…**, and a list of all saved teams to rename, export, share, delete or import). Rotation saving lives in the Rotation section (**Save changes to rotation**, **Save rotation as new…**, **Make main ★**, **Rename**, **Delete**). The main rotation can't be deleted until another is made main. Teams saved before main rotations existed get their oldest rotation as main.
   - **Team:** four slots with searchable pickers for character, **any level** (type it, e.g. 81; six ascension stars light up from the level, and at 20, 40, 50, 60, 70 or 80 you tap the next star if the character has ascended there, e.g. 80/90; weapons work the same way), constellation, base talent levels, weapon (only types the character can use), weapon level, refinement and artifact sets (4-piece, 2 + 2 or none), plus stats entered one of two ways: **artifact stats** (totals across the five artifacts), or **character totals** as the character screen or Hoyolab shows them (HP, ATK, DEF, EM, Crit Rate, Crit DMG, ER, elemental and physical DMG Bonus). For totals, gcsim works out the character's stats without artifacts (alone, so no resonance or team buffs: level, ascension, weapon, 2-piece set bonuses, permanent passives), and the artifact part starts as total − that. Because some passives turn one stat into another (Xiphos' Moonlight: Energy Recharge from Elemental Mastery; Staff of Homa: ATK from HP), the app then checks with gcsim and corrects the artifact stats until gcsim shows the same totals as typed (usually 2–3 quick rounds). It's shown in a Total / No artifacts / Artifacts table. Switching a character from artifact stats to totals fills the totals in from gcsim. With artifact stats it shows each character's stat totals (character, weapon and artifacts, before passives, set effects and team buffs, which gcsim applies itself) and the gcsim lines for the team. Characters gcsim doesn't support yet are marked and skipped (see below). **Clear current team** empties the four slots and keeps the rotation.
   - **Rotation:** an **Opener** (runs once) and a **Loop** (repeats), written the community way, for example `Furina E D Q > Escoffier E Q > Shenhe hE Q tE? > Skirk tE N5 Q N5 D N3 C N3 W`. Each turn starts with the character's name (any word of it, or tap the name chips). Besides the shorthand moves (`E`, `tE`, `hE`, `Q`, `N5`, `C`, `N2C`, `P`, `lP`, `D`, `J`, `W`…) you can write `Q?` (only if ready), `Q@1/2` (loops 1, 3, 5…), `Q@2+` (from loop 2), `Q?|E` (burst if ready, otherwise skill) and lines starting with `!` in gcsim's own language. A turn with nothing to do in a loop is skipped, swap included. A Notation guide lists everything, and a live preview shows the gcsim code for every turn and highlights unknown moves. **Clear current rotation** empties the Opener and Loop and keeps the team. The shorthand table can be edited here.
2. **Run**: the Now simulating bar, then **fight settings**: the **enemy** (a training dummy with one resistance for every element, or any of gcsim's 462 enemies, searchable by name or resistance, with their real resistance to each element and whether they can be frozen), an optional **enemy HP** (the actual HP, multipliers included; typed as 3,500,000 or 3.5m), fight length (a **time limit** when HP is set), enemy level, number of enemies (1 to 5, placed 4.1 m apart so they don't overlap; all the same enemy) and random energy. Then 100, 500 (default) or 1,000 fights, and Run. The work is shared across several workers (parallel copies of the engine), with a progress bar, a live DPS preview and **Cancel**. gcsim checks the config first and its error messages are shown as they are. A run keeps going if you switch tabs. You can name a run before running it. **Paste a gcsim config** runs any config (and is where the placeholder test team can be loaded).
3. **Results** (summary first, then sections you can fold away; on phones only the key ones start open):
   - With an enemy HP: **time to kill** first (average, how precise it is, fastest and slowest kill, DPS against that HP), a clear warning when some fights hit the time limit, and "Not killed" when none did. Damage over the fight stops at the fastest kill and rotation timing counts loops in each fight's real length.
   - Otherwise: **Team DPS** with the **total damage** over the fight under it, how precise it is ("accurate to about ±…"), the typical spread, and the worst and best fight
   - **Who does the damage:** each character's share of team damage and of time on field
   - **Time lost:** gcsim's warnings in plain English (who waited, how long, why) and any smaller delays
   - **Rotation timing:** opener and loop length, loops in the fight, a numbered pie chart of one loop, and every turn's time, with turns that vary a lot flagged
   - **Damage over the fight**, **Damage by source**, **Energy** (how much each character received and from where) and **Reactions**
   - Each character keeps one colour (by team slot) on every chart, and every value is also shown as text
4. **Compare**: the verdict always describes Scenario A against Scenario B, in DPS and as a percentage of B: "Scenario A was clearly better than Scenario B by 3,412 DPS (+5.1%)". A real difference of 5% or more is *clearly* better or worse, a smaller real one is better or worse, and one within what randomness alone could explain is *too close to call*. Runs against the same enemy HP where every fight killed are compared by **time to kill** ("it killed 1.7 s (3.0%) faster"); otherwise by DPS, with a warning if one run had HP and the other didn't, or the HP differs. Pick Scenario A and B from History or a run file. The verdict accounts for randomness (with the margin shown), and there's a warning when fight settings or gcsim versions differ, and a list of what changed. Same team: each character's DPS A → B, the biggest damage changes and time lost. Different teams: both side by side. **Compare a change…** on Results makes a run Scenario A and each next run Scenario B.
5. **History**: every successful run is saved automatically with its team, rotation, fight settings, config, full results and rotation timing. Runs are named "Successful Run – *the four characters*", "Successful Run – *team* · *rotation*" for an unchanged saved team, or "Successful Run – *your label*"; imported runs say "Imported Run". Search, open any run's Results, rename, delete, load a run's team and rotation back, compare two runs, and export one, selected or all runs.
6. **Backup & restore** (Home): export everything (runs, saved teams, current team, rotation, settings, shorthand table) as one file, and import it on another device. Any Import button reads any export file and shows what's inside before adding anything.

Your data stays on each device; nothing is uploaded. After the first visit the app and the gcsim engine work offline. When a new version is published, an **Update** button appears.

### Beyond the original plan

Added during Phase 1 at the owner's request: Opener/Loop rotations with `?`, `@` and `|`; rotation timing; damage over the fight and energy sources; run names and labels; saved teams with labelled rotations and a main rotation; the merged Setup screen with the Now simulating switcher; team and full-backup files; and the Compare screen. The plan's own Phase 1 items are all in.

### Known limits

- Five characters aren't in gcsim yet, and Linnea, Nefer and Vodyanitsa are experimental (see below); a team simulated without one of its members shows too little DPS.
- Results are averages of random fights: small differences between runs can be luck. Compare shows when that's the case; 1,000 fights give the most precise numbers.
- With an enemy HP, the time limit is checked before each Loop turn, so a fight can run a little past it (the turn in progress finishes).
- Enemies are standing targets with their real resistances; boss mechanics (shields, phases where they can't be hit, moving around, resistance changes) aren't simulated.
- `?` on a move that a later move depends on can make gcsim stop (for example `Kazuha tE? P`: if the skill is skipped, Kazuha isn't airborne for the plunge). gcsim's message says so.
- The buff data in `data/buffs.json` is mostly machine-read from game text and not yet used by Phase 1 screens; it needs review before Phase 3's buff reference screen.

### What's next

- **Phase 2, sheet mode:** a real spreadsheet with formulas, templates from the original workbook (single hit, crit value, substat comparison, reactions, team buffs) and functions that read the current team.
- **Phase 3, polish:** a buff reference screen with corrections, a scripted data update pipeline, and a documented gcsim upgrade procedure.

## The placeholder test team

`reference/sample_gcsim_config.txt` is a **placeholder test team**: C0 Neuvillette, Kazuha, Furina and Xilonen with builds chosen for testing. **They are not the owner's real builds.** It is used only as a test case, to confirm the app gives the same answers as gcsim, which reported about 35,100 team DPS for it (`reference/sample_gcsim_result.json`).

- It is never loaded as a default team. In the app it only appears if you choose **Paste a gcsim config** on the Run screen and tap **Load placeholder test team**, and it is then labelled "Placeholder test team" on the Run and Results screens.
- GitHub Actions runs it after every engine build and fails the build if the DPS is more than 10% away from 35,100.
- Any numbers from it, such as character DPS shares or warnings about waiting for energy, describe the placeholder builds, not a real team.

## Using the app

Once published, the app lives at `https://<your GitHub username>.github.io/kairi-genshin-calculator/`.

- **Phone (Android, Chrome):** open the link, wait for "Saved for offline use", then menu ⋮ → *Add to Home screen* / *Install app*.
- **iPhone (Safari):** open the link, then Share → *Add to Home Screen*.
- **PC (Chrome or Edge):** open the link and click the install icon in the address bar.

The first visit downloads about 8 MB (mostly the gcsim engine). When a new version is published, the app shows an **Update** button instead of reloading by itself.

## How publishing works

Two workflows in `.github/workflows/` run on GitHub's servers:

| File | What it does |
| --- | --- |
| `build-gcsim-wasm.yml` | Downloads gcsim at the version in `gcsim-version.txt`, applies `patches/`, compiles its browser engine (`main.wasm` plus Go's `wasm_exec.js`), then tests it by simulating the placeholder test team and checking the DPS is within 10% of 35,100. gcsim does not publish this file itself, which is why we build it. |
| `deploy.yml` | Runs on every push. Uses the engine from the first workflow, builds the app, and publishes it to GitHub Pages, but only for pushes to `main`. Other branches just get a test build. |

You can watch them in the repository's **Actions** tab. A green tick means it worked.

**One-time setup:** in the repository, go to Settings → Pages → Build and deployment → Source, and choose **GitHub Actions**.

## Updating gcsim

The app uses **gcsim v2.50.0** (pinned in `gcsim-version.txt`).

To upgrade:
1. Change the tag in `gcsim-version.txt` (for example `v2.50.0` → `v2.51.0`).
2. If the new version adds characters, weapons or sets, fill in their `gcsim_key` in `data/characters.json`, `data/weapons.json` or `data/artifact_sets.json`, and add them to `data/gcsim_keys.json`. gcsim's accepted names are in its `pkg/shortcut/*.dm.go` files.
3. The build applies `patches/` (characters gcsim doesn't include yet). If a patch no longer applies, the build says why; if gcsim now includes that character, the build skips the patch and you delete it (see `patches/README.md`).
4. Run `npm run engine` and then `node scripts/export_enemies.mjs` to refresh the enemy list (`data/enemies.json`) from the new version.
5. Push. The workflow rebuilds the engine and retests it with the placeholder test team.

### Characters gcsim doesn't support yet

As of gcsim v2.50.0, these characters are in the app's data (stats, talents and buffs) but gcsim can't simulate them yet, so the Setup screen warns and skips them: **Kachina, Lohen, Mitya, Valeriy, Vesna**. A team simulated without one of its members shows too little DPS, because that character's damage and buffs are missing. Sandrone was added in v2.50.0.

**Experimental:** **Linnea**, **Nefer** and **Vodyanitsa** aren't in gcsim yet either, but the app adds them from unfinished gcsim pull requests (`patches/linnea.patch`, `patches/nefer.patch` and `patches/vodyanitsa.patch`, with fixes so gcsim's own checks pass, the bugs its review found are corrected, and teams without them are unaffected). They're marked "Experimental" in the app and gcsim flags them as incomplete in results: the code hasn't been reviewed by gcsim's maintainers, so their numbers may not match the game. Nefer can't plunge (her plunge timings were never counted). See `patches/README.md`.

## For developers

Needs Node 22+, Git, and Go (any recent version; Go downloads the exact version gcsim needs by itself).

```bash
npm install
npm run engine        # build gcsim's engine into public/gcsim/ (first time takes a few minutes)
npm run engine:test   # check the engine with the placeholder test team
npm run dev           # start a local server with live reload
npm test              # run the automatic tests
npm run build         # type-check and build the production app into dist/
```

Project layout: `src/` app code (`src/engine/` runs gcsim in workers, `src/team/` the team model, stat totals and gcsim lines, `src/teams/` saved teams and main rotations, `src/rotation/` rotation notation and timing, `src/config/` the full gcsim config and fight settings, `src/results/` turns gcsim's results into readable rows, `src/compare/` comparing two runs, `src/history/` run history, `src/transfer.ts` export and import files, `src/data/` loads the game data, `src/components/` shared pieces such as charts and pickers, `src/screens/` one file per screen), `public/` icons and (after `npm run engine`) the engine, `scripts/` engine build and test scripts plus the data-generation prototypes, `data/` game data, `reference/` the original workbook and the placeholder test team (see `reference/README.md`).

## Licence

AGPL-3.0, the same as gcsim. See `LICENSE`.
