/// <reference types='vitest' />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import federation from '@originjs/vite-plugin-federation';
import { VitePWA } from 'vite-plugin-pwa';
// @ts-expect-error - site.webmanifest.json is not a module
import siteWebManifest from './src/service-worker/site.webmanifest.json';
import tailwindcss from '@tailwindcss/vite';

export function normalizeFederationFsUrlsPlugin(): Plugin {
  return {
    name: 'attraccess:normalize-federation-fs-urls',
    enforce: 'post',
    transform(code, id) {
      if (id !== '\0virtual:__federation__') return;
      return code.replaceAll('/@fs//', '/@fs/');
    },
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const allowedHosts = process.env.VITE_ALLOWED_HOSTS?.split(',').map((host) => host.trim()).filter(Boolean);

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/frontend',
    server: {
      port: Number(process.env.VITE_PORT) || 4200,
      host: '0.0.0.0',
      ...(allowedHosts?.length ? { allowedHosts } : {}),
      ...(isDev
        ? {
            proxy: {
              '/api': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
                changeOrigin: true,
                ws: true,
              },
              '/cdn': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    preview: {
      port: Number(process.env.VITE_PREVIEW_PORT) || 4300,
      host: '0.0.0.0',
    },
    plugins: [
      tailwindcss(),
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
          'lucide-react': { requiredVersion: '*' },
          '@tanstack/react-query': { requiredVersion: '*' },
        },
      }),
      normalizeFederationFsUrlsPlugin(),
      VitePWA({
        workbox: {
          clientsClaim: true,
          skipWaiting: true,
          // Deliberately excludes `wasm`: apps/frontend/public/openscad/openscad.wasm
          // is 10.3 MB and is fetched on demand by the /printables page only.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,bin,json}'],
          cleanupOutdatedCaches: true,
        },
        includeAssets: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,bin,json}'],
        manifest: siteWebManifest,
        registerType: 'autoUpdate',
        srcDir: 'src',
        filename: 'service-worker.ts',
        strategies: 'injectManifest',
        injectManifest: {
          minify: process.env.NODE_ENV === 'production',
          enableWorkboxModulesLogs: false,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // With strategies: 'injectManifest', workbox-build reads globPatterns from
          // *this* object, not from the `workbox` option above (that one only applies
          // to the 'generateSW' strategy and is otherwise inert here). Its own default
          // is ['**/*.{js,wasm,css,html}'], which WOULD precache openscad.wasm.
          // Deliberately excludes `wasm`: apps/frontend/public/openscad/openscad.wasm
          // is 10.3 MB and is fetched on demand by the /printables page only.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,bin,json}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    worker: {
      format: 'es',
      plugins: () => [nxViteTsPaths()],
    },
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
  };
});
