import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [
    react(),
    // React Compiler source maps can omit function columns. CRAP needs original
    // function boundaries to match coverage to source complexity.
    ...(process.env.CRAP_SCORE_COVERAGE === '1' ? [] : [babel({ presets: [reactCompilerPreset()] })]),
    nxViteTsPaths(),
  ],
  resolve: {
    alias: {
      'virtual:__federation__': path.join(__dirname, 'src/test-utils/federation-stub.ts'),
    },
  },
  test: {
    root: __dirname,
    // This CLI integration suite runs with node:test, including in the CRAP runner.
    exclude: [...configDefaults.exclude, 'extract-dependencies.test.mjs'],
    globals: true,
    environment: 'happy-dom',
    setupFiles: [path.join(__dirname, 'src/test-utils/setup.ts')],
    testTimeout: 20000,
    hookTimeout: 20000,
    // ponytail: retry flaky modal+userEvent tests that timeout under concurrent load
    retry: 2,
  },
  esbuild: {
    target: 'node20',
  },
});
