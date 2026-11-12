# Kairi Genshin Calculator

A Genshin Impact theorycrafting app that runs real [gcsim](https://github.com/genshinsim/gcsim) simulations on your phone or PC, in the browser, with nothing to install. It can be added to your home screen and works offline. See `PROJECT_PLAN.md` for the full plan.

## Status

**Phase 1, step 1 of several: project setup.** What exists so far:

- The app shell: a phone-first page with tabs (Home, Team, Rotation, Run, Results, History). Only Home does anything yet; the other tabs are placeholders.
- An **Engine check** on Home that loads gcsim, validates the sample team from `reference/sample_gcsim_config.txt`, and runs 20 simulations. You should see about 35,100 DPS. This is a temporary test and will be replaced by the real Run screen.
- Offline support: after the first visit, the app and the gcsim engine are saved on the device.
- Automatic building and publishing with GitHub Actions (see below).

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
| `build-gcsim-wasm.yml` | Downloads gcsim at the version in `gcsim-version.txt`, compiles its browser engine (`main.wasm` plus Go's `wasm_exec.js`), then tests it by simulating the sample team and checking the DPS is within 10% of 35,100. gcsim does not publish this file itself, which is why we build it. |
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
npm run engine:test   # check the engine with the sample team
npm run dev           # start a local server with live reload
npm run build         # type-check and build the production app into dist/
```

Project layout: `src/` app code, `public/` icons and (after `npm run engine`) the engine, `scripts/` engine build and test scripts plus the data-generation prototypes, `data/` game data, `reference/` the original workbook and gcsim samples.

## Licence

AGPL-3.0, the same as gcsim. See `LICENSE`.
