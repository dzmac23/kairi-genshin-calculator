import { defineConfig } from 'vitest/config';

// Only run this app's tests. Without this, Vitest would also pick up gcsim's own test files
// in .cache/ (where scripts/build-gcsim.sh downloads gcsim's source).
export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify('test') },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
