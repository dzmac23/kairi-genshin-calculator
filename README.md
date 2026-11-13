# Kairi Genshin Calculator

A Genshin Impact theorycrafting app that runs real [gcsim](https://github.com/genshinsim/gcsim) simulations on your phone or PC, in the browser, with nothing to install. It can be added to your home screen and works offline. See `PROJECT_PLAN.md` for the full plan.

## Status

**Phase 1, step 3 of 7: the Results screen.** What exists so far:

- The **Run** screen: choose 100, 500 (default) or 1000 iterations and press Run. The simulation is shared across several workers (parallel copies of the engine), with a progress bar, a live DPS preview and a **Cancel** button. Mistakes in the config are shown with gcsim's own error message. A run keeps going if you switch tabs.
- The **Results** screen shows the last finished run:
  - team DPS (average, standard deviation, lowest and highest)
  - gcsim's warnings in plain English, such as "Neuvillette waited 5.8 s per fight for his skill cooldown"
  - each character's DPS, share of the team, time on field and energy left at the end
  - every damage source from highest to lowest
  - reaction counts
  - all time lost to failed actions (skill cooldown, burst energy, stamina and so on)
- The Run screen starts with **no team**. Until the Team and Rotation screens exist, you can paste any gcsim config, or tap **Load placeholder test team** to check the engine works (see below).
- The other tabs (Team, Rotation, History) are placeholders.
- Offline support: after the first visit, the app and the gcsim engine are saved on the device.
- Automatic testing, building and publishing with GitHub Actions (see below).

## The placeholder test team

`reference/sample_gcsim_config.txt` is a **placeholder test team**: C0 Neuvillette, Kazuha, Furina and Xilonen with builds chosen for testing. **They are not the owner's real builds.** It is used only as a test case, to confirm the app gives the same answers as gcsim, which reported about 35,100 team DPS for it (`reference/sample_gcsim_result.json`).

- It is never loaded as a default team. In the app it only appears if you tap **Load placeholder test team**, and it is then labelled "Placeholder test team" on the Run and Results screens.
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

Change the tag in `gcsim-version.txt` (for example `v2.49.6` → `v2.50.0`) and push. The workflow rebuilds and retests the engine automatically.

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

Project layout: `src/` app code (`src/engine/` runs gcsim in workers, `src/results/` turns gcsim's results into readable rows, `src/screens/` holds each screen), `public/` icons and (after `npm run engine`) the engine, `scripts/` engine build and test scripts plus the data-generation prototypes, `data/` game data, `reference/` the original workbook and the placeholder test team (see `reference/README.md`).

## Licence

AGPL-3.0, the same as gcsim. See `LICENSE`.
