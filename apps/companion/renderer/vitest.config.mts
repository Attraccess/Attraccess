import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: { environment: 'jsdom', include: ['apps/companion/renderer/src/**/*.test.tsx'] },
});
