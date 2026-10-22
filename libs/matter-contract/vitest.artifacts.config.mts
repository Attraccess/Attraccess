import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['libs/matter-contract/**/*.artifacts.test.ts'],
    exclude: [],
    // Standard validators compile the finite interval-order tree. Keep enough
    // headroom for CI load; the regular unit tests retain their shorter deadline.
    testTimeout: 60000,
  },
});
