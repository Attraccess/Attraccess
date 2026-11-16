import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../libs/plugins-frontend-sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.spec.mts'],
    // These specs spawn real processes, which are slow on a loaded machine.
    testTimeout: 30_000,
    coverage: {
      // Unit coverage feeds the project's crap-score target.
      enabled: true,
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: fileURLToPath(new URL('../coverage/root/test/vitest', import.meta.url)),
    },
  },
});
