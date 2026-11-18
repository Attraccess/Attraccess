import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/shared': fileURLToPath(new URL('../../../../libs/shared/src/index.ts', import.meta.url)),
      '@attraccess/plugins-frontend-ui': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-ui/src/index.ts', import.meta.url),
      ),
      '@attraccess/react-query-client': fileURLToPath(
        new URL('../../scripts/react-query-client.test-stub.ts', import.meta.url),
      ),
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-sdk/src/index.ts', import.meta.url),
      ),
      '@attraccess/application-models': fileURLToPath(
        new URL('../../../../libs/application-models/src/index.ts', import.meta.url),
      ),
      '@attraccess/database-entities': fileURLToPath(
        new URL('../../../../libs/database-entities/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('../../scripts/css-escape.test-setup.ts', import.meta.url))],
    include: ['apps/plugins/wago/frontend/tests/*.test.tsx', 'apps/plugins/wago/frontend/src/**/*.{test,spec}.tsx'],
    // tests/front-panel.test.tsx drives user-event flows through the large 879-3020 meter form. With the 5 s default
    // on a quiet host "adds a meter with the recommended readings and switches readings per register" times out
    // (5.2 s; "keeps a reading that a guard uses enabled..." takes 4.0 s). On a loaded host the three slowest tests
    // take 11-25 s (measured ATT-1216, coverage enabled). File parallelism needs no override.
    testTimeout: 30_000,
    coverage: {
      // Unit coverage feeds the project's crap-score target.
      enabled: true,
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: fileURLToPath(new URL('../../../../coverage/apps/plugins/wago/test-frontend', import.meta.url)),
      // Test helpers contain hoisted mocks that Istanbul's instrumentation breaks.
      exclude: [...coverageConfigDefaults.exclude, 'apps/plugins/wago/frontend/tests/**', '**/*.test-fixture.{ts,tsx}'],
    },
  },
  esbuild: { jsx: 'automatic' },
});
