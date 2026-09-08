import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../../../libs/plugins-frontend-sdk/src/lib/frontend.api-client.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      'apps/plugins/wago/frontend/tests/*.test.tsx',
      'apps/plugins/wago/frontend/src/ModbusConfigurationForm.spec.tsx',
    ],
    // The visual editor and Modbus form tests both render into jsdom's global document.
    // Running files concurrently allows user-event interactions in one file to target
    // another file's DOM, producing intermittent input corruption and timeouts.
    fileParallelism: false,
    testTimeout: 15_000,
  },
  esbuild: { jsx: 'automatic' },
});
