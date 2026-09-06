import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import base from '../harness/vite.config.mts';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: resolve(
      process.env.WAGO_BROWSER_ARTIFACTS_ROOT ??
        fileURLToPath(new URL('../../../../../../output/playwright', import.meta.url)),
      'att-973-commissioning/harness',
    ),
    emptyOutDir: true,
  },
});
