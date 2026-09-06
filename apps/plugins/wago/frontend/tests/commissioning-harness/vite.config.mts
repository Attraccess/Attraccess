import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import base from '../harness/vite.config.mts';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: fileURLToPath(
      new URL('../../../../../../output/playwright/att-973-commissioning/harness', import.meta.url),
    ),
    emptyOutDir: true,
  },
});
