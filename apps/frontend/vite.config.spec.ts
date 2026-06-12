import { describe, expect, it } from 'vitest';
import { normalizeFederationFsUrlsPlugin } from './vite.config';

describe('normalizeFederationFsUrlsPlugin', () => {
  it('normalizes doubled /@fs/ slashes in the federation virtual module', () => {
    const plugin = normalizeFederationFsUrlsPlugin();
    const transform = plugin.transform;

    expect(typeof transform).toBe('function');
    const result = transform.call(
      {} as never,
      "get:()=> get(window.location.origin+'/@fs//Users/example/node_modules/.vite/react.js', remoteFrom)",
      '\0virtual:__federation__'
    );

    expect(result).toBe(
      "get:()=> get(window.location.origin+'/@fs/Users/example/node_modules/.vite/react.js', remoteFrom)"
    );
  });
});
