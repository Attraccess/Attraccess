import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttraccessFrontendPlugin } from '@attraccess/plugins-frontend-sdk';
import type { LoadedPluginManifest } from '@attraccess/react-query-client';
import usePluginState, { PluginManifestWithPlugin } from './plugin.state';

function createPlugin(name: string): AttraccessFrontendPlugin {
  return {
    getPluginName: () => name,
    getDependencies: () => [],
    init: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    onApiAuthStateChange: vi.fn(),
    onApiEndpointChange: vi.fn(),
  } as unknown as AttraccessFrontendPlugin;
}

function createManifest(name: string): PluginManifestWithPlugin {
  return {
    name,
    version: '1.0.0',
    plugin: createPlugin(name),
  } as unknown as LoadedPluginManifest & { plugin: AttraccessFrontendPlugin };
}

describe('usePluginState', () => {
  beforeEach(() => {
    usePluginState.setState({ plugins: [] });
  });

  it('starts with an empty plugin list', () => {
    expect(usePluginState.getState().plugins).toEqual([]);
  });

  it('appends plugins via addPlugin without dropping existing ones', () => {
    const first = createManifest('first');
    const second = createManifest('second');

    usePluginState.getState().addPlugin(first);
    usePluginState.getState().addPlugin(second);

    const { plugins } = usePluginState.getState();
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.plugin.getPluginName())).toEqual(['first', 'second']);
  });

  it('reports isInstalled true only for plugins already added', () => {
    expect(usePluginState.getState().isInstalled('alpha')).toBe(false);

    usePluginState.getState().addPlugin(createManifest('alpha'));

    expect(usePluginState.getState().isInstalled('alpha')).toBe(true);
    expect(usePluginState.getState().isInstalled('beta')).toBe(false);
  });

  it('matches isInstalled on the plugin name, not the manifest name', () => {
    const manifest = createManifest('manifest-name');
    (manifest.plugin.getPluginName as ReturnType<typeof vi.fn>) = vi.fn(() => 'runtime-name');

    usePluginState.getState().addPlugin(manifest);

    expect(usePluginState.getState().isInstalled('runtime-name')).toBe(true);
    expect(usePluginState.getState().isInstalled('manifest-name')).toBe(false);
  });
});
