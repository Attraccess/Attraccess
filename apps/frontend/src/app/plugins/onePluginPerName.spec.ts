import type { LoadedPluginManifest } from '@attraccess/react-query-client';
import { describe, expect, it } from 'vitest';
import { onePluginPerName } from './onePluginPerName';

const manifest = (name: string, version: string, status: LoadedPluginManifest['status']) =>
  ({ name, version, status, pluginDirectory: `${name}-${version}` }) as LoadedPluginManifest;

describe('onePluginPerName', () => {
  it('keeps the working copy when a refused copy of the same name comes first', () => {
    const refused = manifest('shelly', '1.9.0', 'error');
    const working = manifest('shelly', '2.0.0', 'loaded');
    expect(onePluginPerName([refused, working])).toEqual([working]);
    expect(onePluginPerName([working, refused])).toEqual([working]);
  });

  it('keeps a failed plugin that has no other copy, so its failure is still handled', () => {
    const failed = manifest('wago', '2.0.0', 'error');
    const other = manifest('matter', '2.0.0', 'loaded');
    expect(onePluginPerName([failed, other])).toEqual([failed, other]);
  });
});
