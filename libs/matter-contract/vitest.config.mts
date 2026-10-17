import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/matter-contract/testing': resolve('libs/matter-contract/src/fixtures.ts'),
      '@attraccess/matter-contract': resolve('libs/matter-contract/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['libs/matter-contract/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/*.artifacts.test.ts'],
    testTimeout: 10000,
  },
});
