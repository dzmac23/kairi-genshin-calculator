import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repository at https://<user>.github.io/kairi-genshin-calculator/,
// so every URL in the built app must start with that folder name.
const base = '/kairi-genshin-calculator/';

// Which build of the app this is, for problem reports: the build date and the code version.
function appBuild(): string {
  const date = new Date().toISOString().slice(0, 10);
  try {
    return `${date} (${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()})`;
  } catch {
    return date;
  }
}

export default defineConfig({
  base,
  define: { __APP_BUILD__: JSON.stringify(appBuild()) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' means a new version is downloaded in the background, and the app shows an
      // "update available" button instead of reloading by itself (which could cut off a running sim).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kairi Genshin Calculator',
        short_name: 'Kairi Calc',
        description: 'Genshin Impact theorycrafting with gcsim simulations that run on your device.',
        theme_color: '#1b1f2a',
        background_color: '#1b1f2a',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything listed here is saved on the device on first visit, so the app works offline.
        // This includes the gcsim engine (public/gcsim/main.wasm, about 45 MB, 8 MB to download).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,json}'],
        // Workbox skips files over 2 MB by default; raise the limit so the engine is cached too.
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
      },
    }),
  ],
});
