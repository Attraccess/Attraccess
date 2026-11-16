import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'jsdom',
    include: ['apps/companion/renderer/src/**/*.test.tsx'],
    coverage: {
      // Unit coverage feeds the project's crap-score target.
      enabled: true,
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: fileURLToPath(new URL('../../../coverage/apps/companion/test-renderer', import.meta.url)),
    },
  },
});
