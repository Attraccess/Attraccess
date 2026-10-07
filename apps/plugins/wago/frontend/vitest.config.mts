import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/plugins-frontend-ui': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-ui/src/lib/i18n.ts', import.meta.url),
      ),
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-sdk/src/index.ts', import.meta.url),
      ),
      '@attraccess/database-entities': fileURLToPath(
        new URL('../../../../libs/database-entities/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['apps/plugins/wago/frontend/tests/*.test.tsx', 'apps/plugins/wago/frontend/src/**/*.{test,spec}.tsx'],
    // The visual editor and Modbus form tests both render into jsdom's global document.
    // Running files concurrently allows user-event interactions in one file to target
    // another file's DOM, producing intermittent input corruption and timeouts.
    fileParallelism: false,
    testTimeout: 15_000,
    coverage: {
      // Test helpers contain hoisted mocks that Istanbul's instrumentation breaks.
      exclude: [...coverageConfigDefaults.exclude, 'apps/plugins/wago/frontend/tests/**', '**/*.test-fixture.{ts,tsx}'],
    },
  },
  esbuild: { jsx: 'automatic' },
});
