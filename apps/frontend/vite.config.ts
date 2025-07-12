/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import federation from '@originjs/vite-plugin-federation';
import { VitePWA } from 'vite-plugin-pwa';
import replace from '@rollup/plugin-replace';
// @ts-expect-error - site.webmanifest.json is not a module
import siteWebManifest from './src/service-worker/site.webmanifest.json';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/frontend',
  server: {
    port: 4200,
    host: '0.0.0.0',
  },
  preview: {
    port: 4300,
    host: '0.0.0.0',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin([]),
    federation({
      name: 'attraccess',
      remotes: {
        // Dynamic remotes will be loaded at runtime
        // dummy remote so that vite prepares the shared libs,
        // otherwise the shared libs are not loaded and the dynamic remotes are not working
        dummy: './dummy.js',
      },
      shared: {
        react: { requiredVersion: '*' },
        'react-dom': { requiredVersion: '*' },
        'react-router-dom': { requiredVersion: '*' },
        'react-pluggable': { requiredVersion: '*' },
        '@heroui/react': { requiredVersion: '*' },
        '@tanstack/react-query': { requiredVersion: '*' },
      },
    }),
    replace({ __DATE__: new Date().toISOString(), __RELOAD_SW__: 'true', preventAssignment: true }),
    VitePWA({
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      workbox: {
        clientsClaim: process.env.NODE_ENV === 'production',
        skipWaiting: process.env.NODE_ENV === 'production',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,bin,json}'],
      },
      includeAssets: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,bin,json}'],
      manifest: siteWebManifest,
      registerType: process.env.NODE_ENV === 'production' ? 'autoUpdate' : 'prompt',
      srcDir: 'src',
      filename: 'service-worker.ts',
      strategies: 'injectManifest',
      injectManifest: {
        minify: process.env.NODE_ENV === 'production',
        enableWorkboxModulesLogs: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/frontend',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    target: 'esnext',
    minify: 'esbuild',
  },
});
