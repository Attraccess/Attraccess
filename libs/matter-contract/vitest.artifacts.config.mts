import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['libs/matter-contract/**/*.artifacts.test.ts'], exclude: [] },
});
