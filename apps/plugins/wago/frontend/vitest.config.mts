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
    testTimeout: 15_000,
  },
  esbuild: { jsx: 'automatic' },
});
