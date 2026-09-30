import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: {
    include: ['test/**/*.unit.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: fileURLToPath(new URL('../test-results/harness.xml', import.meta.url)) },
  },
});
