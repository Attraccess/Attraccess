import { describe, expect, it } from 'vitest';
import { HOST_SHARED } from './vite-federation.config.mjs';

describe('plugin federation shared dependencies', () => {
  it('uses host-owned singletons without remote fallback imports', () => {
    for (const dependency of ['react', 'react-dom', 'react-router-dom', '@heroui/react', 'lucide-react', '@tanstack/react-query']) {
      expect(HOST_SHARED[dependency]).toMatchObject({ singleton: true, import: false, generate: false });
    }
  });
});
