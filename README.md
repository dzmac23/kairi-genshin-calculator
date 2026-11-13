# Kairi Genshin Calculator

A Genshin Impact theorycrafting app that runs real [gcsim](https://github.com/genshinsim/gcsim) simulations on your phone or PC, in the browser, with nothing to install. It can be added to your home screen and works offline. See `PROJECT_PLAN.md` for the full plan.

## Status

**Phase 1, step 5c: Results redesign. The app is usable:** build a team, write a rotation, run it, read the results. What exists so far:

- The **Run** screen: choose 100, 500 (default) or 1000 iterations and press Run. The simulation is shared across several workers (parallel copies of the engine), with a progress bar, a live DPS preview and a **Cancel** button. Mistakes in the config are shown with gcsim's own error message. A run keeps going if you switch tabs.
- The **Results** screen shows the last finished run, summary first, then sections you can fold away (with shortcuts to each):
  - **Team DPS** with how precise it is ("accurate to about ±…"), the typical spread, and the worst and best fight
  - **Who does the damage:** stacked bars of each character's share of team damage and of time on field, plus a compact table
  - **Time lost:** gcsim's warnings in plain English (who waited, how long, why) and any smaller delays
  - **Rotation timing** (Team + Rotation runs): opener and loop length, loops in the fight, a one-loop bar, and every turn's time, with turns that vary a lot flagged
  - **Damage over the fight:** team DPS through the fight (tap for exact values, or show as a table)
  - **Damage by source**, highest first, and **Energy:** how much energy each character received and from where
  - **Reactions**, totalled per reaction
  - Each character keeps one colour (by team slot) on every chart, and every value is also shown as text
- The **Team** screen: four slots, each with a searchable character picker, level, constellation, base talent levels, weapon (only types the character can use), weapon level, refinement, artifact sets (4-piece, 2 + 2 or none) and artifact stat totals. It shows each character's stat totals (character, weapon and artifacts, before passives, set effects and team buffs, which gcsim applies itself) and the gcsim lines for the team. The team is saved on this device automatically. Characters gcsim doesn't support yet get a warning and are skipped (see below).
- The **Rotation** screen: an **Opener** (runs once) and a **Loop** (repeats), written the community way, for example `Furina E D Q > Escoffier E Q > Shenhe hE Q tE? > Skirk tE N5 Q N5 D N3 C N3 W`. Each turn starts with the character's name (any word of it, or tap the name chips). Besides the shorthand moves (`E`, `hE`, `Q`, `N5`, `C`, `N2C`, `P`, `lP`, `D`, `J`, `W`…) you can write `Q?` (only if ready), `Q@1/2` (loops 1, 3, 5…), `Q@2+` (from loop 2), `Q?|E` (burst if ready, otherwise skill) and lines starting with `!` in gcsim's own language. A turn with nothing to do in a loop is skipped, swap included. The Notation guide on the screen lists everything, and a live preview shows the gcsim code for every turn. Fight settings live here too: fight length, enemy level, enemy resistance, number of enemies (1 to 5; extra enemies stand 4.1 m apart so they don't overlap) and random energy. The shorthand table can be edited in the app. Rotation, settings and table are saved on this device.
- The **Run** screen runs **Team + Rotation** by default and lists anything that still needs fixing. You can still choose **Paste a gcsim config** to run any config, or load the placeholder test team there (see below).
- The History tab is a placeholder (next step).
- Offline support: after the first visit, the app and the gcsim engine are saved on the device.
- Automatic testing, building and publishing with GitHub Actions (see below).

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
| `build-gcsim-wasm.yml` | Downloads gcsim at the version in `gcsim-version.txt`, compiles its browser engine (`main.wasm` plus Go's `wasm_exec.js`), then tests it by simulating the placeholder test team and checking the DPS is within 10% of 35,100. gcsim does not publish this file itself, which is why we build it. |
| `deploy.yml` | Runs on every push. Uses the engine from the first workflow, builds the app, and publishes it to GitHub Pages, but only for pushes to `main`. Other branches just get a test build. |

You can watch them in the repository's **Actions** tab. A green tick means it worked.

**One-time setup:** in the repository, go to Settings → Pages → Build and deployment → Source, and choose **GitHub Actions**.

## Updating gcsim

The app uses **gcsim v2.50.0** (pinned in `gcsim-version.txt`).

To upgrade:
1. Change the tag in `gcsim-version.txt` (for example `v2.50.0` → `v2.51.0`).
2. If the new version adds characters, weapons or sets, fill in their `gcsim_key` in `data/characters.json`, `data/weapons.json` or `data/artifact_sets.json`, and add them to `data/gcsim_keys.json`. gcsim's accepted names are in its `pkg/shortcut/*.dm.go` files.
3. Push. The workflow rebuilds the engine and retests it with the placeholder test team.

### Characters gcsim doesn't support yet

As of gcsim v2.50.0, these characters are in the app's data (stats, talents and buffs) but gcsim can't simulate them yet, so the Team screen warns and skips them: **Kachina, Linnea, Lohen, Mitya, Nefer, Valeriy, Vesna, Vodyanitsa**. A team simulated without one of its members shows too little DPS, because that character's damage and buffs are missing. Sandrone was added in v2.50.0.

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

Project layout: `src/` app code (`src/engine/` runs gcsim in workers, `src/results/` turns gcsim's results into readable rows, `src/team/` holds the team model, stat totals and gcsim line generator, `src/rotation/` translates rotation notation, `src/config/` builds the full gcsim config, `src/data/` loads the game data, `src/screens/` holds each screen), `public/` icons and (after `npm run engine`) the engine, `scripts/` engine build and test scripts plus the data-generation prototypes, `data/` game data, `reference/` the original workbook and the placeholder test team (see `reference/README.md`).

## Licence

AGPL-3.0, the same as gcsim. See `LICENSE`.
