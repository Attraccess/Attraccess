import { defineConfig } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import type { PluginItem, TransformOptions } from '@babel/core';

export const reactCompilerBabelPlugins: PluginItem[] = ['babel-plugin-react-compiler'];

export const reactCompilerBabelConfig: TransformOptions = {
  plugins: reactCompilerBabelPlugins,
};

export default defineConfig({
  plugins: [react({ babel: reactCompilerBabelConfig }), nxViteTsPaths()],
  test: {
    root: __dirname,
    globals: true,
    environment: 'happy-dom',
    setupFiles: [path.join(__dirname, 'src/test-utils/setup.ts')],
  },
  esbuild: {
    target: 'node20',
  },
});
