import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/**/*.spec.ts'],
    coverage: {
      // Unit coverage feeds the project's crap-score target.
      enabled: true,
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: fileURLToPath(new URL('../../coverage/libs/companion-ws-client/test', import.meta.url)),
    },
  },
});
