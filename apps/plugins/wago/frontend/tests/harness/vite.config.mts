import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../../../../../libs/plugins-frontend-sdk/src/lib/frontend.api-client.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: resolve(
      process.env.WAGO_BROWSER_ARTIFACTS_ROOT ??
        fileURLToPath(new URL('../../../../../../output/playwright', import.meta.url)),
      'att-1058/harness',
    ),
    emptyOutDir: true,
  },
});
