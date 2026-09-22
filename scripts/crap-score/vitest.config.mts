import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@attraccess/plugins-frontend-sdk': fileURLToPath(
        new URL('../../libs/plugins-frontend-sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/**/*.spec.mts'],
  },
});
