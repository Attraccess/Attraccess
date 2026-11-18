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
    // Large jsdom renders of the 879-3020 register map set the pace: the meter dialog in tests/front-panel.test.tsx
    // ("meter readings") and the built-in profile in tests/modbus-profile-form.test.tsx. Measured for ATT-1216 with
    // coverage: "adds a meter with the recommended readings and switches readings per register and section" takes
    // 4.6-5.2 s on a quiet host and 7.8 s in the full parallel run, and the slowest front-panel tests reach 11-25 s on
    // a loaded host; modbus-profile-form tests reach 5.2 s in the full run. The 5 s default is too tight for both
    // files. File parallelism needs no override: each test file runs in its own worker with its own jsdom.
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
