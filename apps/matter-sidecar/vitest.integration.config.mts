import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['apps/matter-sidecar/**/*.integration.test.ts'], exclude: [], testTimeout: 20000 },
});
