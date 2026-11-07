import { fileURLToPath } from 'node:url';
import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [
    react(),
    // No React Compiler here: its source maps omit function columns, which the
    // crap-score target needs to match coverage to source complexity. The app
    // build still compiles with it.
    nxViteTsPaths(),
  ],
  resolve: {
    alias: {
      'virtual:__federation__': path.join(__dirname, 'src/test-utils/federation-stub.ts'),
    },
  },
  test: {
    root: __dirname,
    // This CLI integration suite runs with node:test in the test-scripts target.
    exclude: [...configDefaults.exclude, 'extract-dependencies.test.mjs'],
    globals: true,
    environment: 'happy-dom',
    setupFiles: [path.join(__dirname, 'src/test-utils/setup.ts')],
    coverage: {
      // Unit coverage feeds the project's crap-score target.
      enabled: true,
      provider: 'istanbul',
      reporter: ['json'],
      reportsDirectory: fileURLToPath(new URL('../../coverage/apps/frontend/test', import.meta.url)),
      // Split hoisted mock modules are test helpers; Istanbul breaks their hoisting transform.
      exclude: [...coverageConfigDefaults.exclude, '**/*.test.hoisted.{ts,tsx}'],
    },
    testTimeout: 20000,
    hookTimeout: 20000,
    // ponytail: retry flaky modal+userEvent tests that timeout under concurrent load
    retry: 2,
  },
  esbuild: {
    target: 'node20',
  },
});
