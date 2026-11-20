import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  root: __dirname,
  base: './', // assets load via file:// in the packaged Electron app
  cacheDir: '../../../node_modules/.vite/apps/companion-renderer',
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
