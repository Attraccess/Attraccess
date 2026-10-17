import { afterEach, describe, expect, it, vi } from 'vitest';
import config, { normalizeFederationFsUrlsPlugin } from './vite.config';

describe('normalizeFederationFsUrlsPlugin', () => {
  it('normalizes doubled /@fs/ slashes in the federation virtual module', () => {
    const plugin = normalizeFederationFsUrlsPlugin();
    const transform = plugin.transform;

    expect(typeof transform).toBe('function');
    const result = transform.call(
      {} as never,
      "get:()=> get(window.location.origin+'/@fs//Users/example/node_modules/.vite/react.js', remoteFrom)",
      '\0virtual:__federation__',
    );

    expect(result).toBe(
      "get:()=> get(window.location.origin+'/@fs/Users/example/node_modules/.vite/react.js', remoteFrom)",
    );
  });
});

afterEach(() => vi.unstubAllEnvs());

it('configures development ports and proxies from the worktree launcher environment', async () => {
  vi.stubEnv('VITE_PORT', '4250');
  vi.stubEnv('VITE_PREVIEW_PORT', '4350');
  vi.stubEnv('VITE_API_PROXY_TARGET', 'http://localhost:3050');
  if (typeof config !== 'function') throw new Error('Expected a command-aware Vite configuration');
  const development = await config({ command: 'serve', mode: 'development' });
  expect(development.server).toMatchObject({
    port: 4250,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:3050', changeOrigin: true, ws: true },
      '/cdn': { target: 'http://localhost:3050', changeOrigin: true },
    },
  });
  expect(development.preview?.port).toBe(4350);
  expect(development.worker?.format).toBe('es');
});

it('keeps build output separate from development-only proxies and uses default ports', async () => {
  vi.stubEnv('VITE_PORT', '');
  vi.stubEnv('VITE_PREVIEW_PORT', '');
  vi.stubEnv('VITE_API_PROXY_TARGET', '');
  if (typeof config !== 'function') throw new Error('Expected a command-aware Vite configuration');
  const build = await config({ command: 'build', mode: 'production' });
  expect(build.server?.port).toBe(4200);
  expect(build.server?.proxy).toBeUndefined();
  expect(build.preview?.port).toBe(4300);
  expect(build.build).toMatchObject({ outDir: '../../dist/apps/frontend', emptyOutDir: true, target: 'esnext' });
});
