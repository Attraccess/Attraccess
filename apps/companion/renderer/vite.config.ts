import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  base: './', // assets load via file:// in the packaged Electron app
  cacheDir: '../../../node_modules/.vite/apps/companion-renderer',
  plugins: [tailwindcss(), react(), nxViteTsPaths()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        wizard: resolve(__dirname, 'index.html'),
        lockscreen: resolve(__dirname, 'lockscreen.html'),
      },
    },
  },
});
