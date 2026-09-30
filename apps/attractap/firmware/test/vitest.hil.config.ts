import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: {
    include: ['test/suites/**/*.hil.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180000,
    hookTimeout: 60000,
    reporters: ['default', 'junit'],
    outputFile: { junit: fileURLToPath(new URL('../test-results/hil.xml', import.meta.url)) },
  },
});
