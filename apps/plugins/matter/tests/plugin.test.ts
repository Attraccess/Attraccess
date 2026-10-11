import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPORTED_RELEASE } from '@attraccess/matter-contract';

it('loads the bundled backend without core, SDK runtime, matter.js or sidecar connectivity', () => {
  const path = resolve('apps/plugins/matter/package/dist/index.js');
  const source = readFileSync(path, 'utf8');
  expect(source).not.toMatch(/require\(["'](?:@attraccess\/|@matter\/|node:(?:http|net)|ws)/);
  const module = createRequire(import.meta.url)(path) as {
    default: { register(): { controllers: unknown[]; providers: unknown[] } };
    supportedRelease: unknown;
  };
  expect(module.supportedRelease).toEqual(SUPPORTED_RELEASE);
  expect(module.default.register()).toMatchObject({ controllers: [], providers: [] });
  const pkg = JSON.parse(readFileSync('apps/plugins/matter/package/package.json', 'utf8'));
  expect(pkg.attraccess.permissions).toEqual([]);
  expect(pkg.attraccess.frontend).toBeUndefined();
  expect(pkg.attraccess.host).toBe(SUPPORTED_RELEASE.attraccess);
});
