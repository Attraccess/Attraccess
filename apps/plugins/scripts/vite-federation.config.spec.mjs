import { describe, expect, it } from 'vitest';
import { HOST_SHARED } from './vite-federation.config.mjs';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

describe('plugin federation shared dependencies', () => {
  it('uses host-owned singletons without remote fallback imports', async () => {
    for (const dependency of [
      'react',
      'react-dom',
      'react-router-dom',
      '@heroui/react',
      'lucide-react',
      '@tanstack/react-query',
      '@attraccess/plugins-frontend-ui',
    ]) {
      expect(HOST_SHARED[dependency]).toMatchObject({ singleton: true, import: false, generate: false });
      const { packagePath } = HOST_SHARED[dependency];
      expect(existsSync(packagePath)).toBe(true);
      expect(Object.keys(await import(pathToFileURL(packagePath).href))).toEqual([]);
    }
  });
});
