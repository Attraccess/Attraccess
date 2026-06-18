import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['suites/**/*.{test,spec}.ts'],
    // Serial flash + boot easily takes 30-60 s; each suite gets 5 minutes.
    testTimeout: 300_000,
    hookTimeout: 60_000,
    reporters: ['default', 'junit'],
    outputFile: { junit: '../../../test-results/e2e-results.xml' },
    // Run suites sequentially: only one physical device is connected.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
  },
});
