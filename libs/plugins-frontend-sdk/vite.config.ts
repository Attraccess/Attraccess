/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import type { PluginItem, TransformOptions } from '@babel/core';

export const reactCompilerBabelPlugins: PluginItem[] = ['babel-plugin-react-compiler'];

export const reactCompilerBabelConfig: TransformOptions = {
  plugins: reactCompilerBabelPlugins,
};

const sharedLibs = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-pluggable',
  '@heroui/react',
  '@tanstack/react-query',
  '@attraccess/react-query-client',
  '@attraccess/plugins-frontend-ui',
];

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/plugins-frontend-sdk',
  plugins: [
    react({ babel: reactCompilerBabelConfig }),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    dts({ entryRoot: 'src', tsconfigPath: path.join(__dirname, 'tsconfig.lib.json') }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: '../../dist/libs/plugins-frontend-sdk',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: 'plugins-frontend-sdk',
      fileName: 'index',
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ['es'],
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: sharedLibs,
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/plugins-frontend-sdk',
      provider: 'v8',
    },
    passWithNoTests: true,
  },
});
