import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/companion-renderer',
  plugins: [tailwindcss(), react(), nxViteTsPaths()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
