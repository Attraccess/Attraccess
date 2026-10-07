import { render } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { it } from 'vitest';
import { PluginProvider } from './plugin-provider';
import usePluginState from './plugin.state';
import type { PluginProviderTestScope } from './plugin-provider.spec';

export function registerSetsUpTheModuleFederationRemoteAndLoadsThePluginIntoTheStore(
  scope: PluginProviderTestScope,
): void {
  it('sets up the module-federation remote and loads the plugin into the store', async () => {
    const { name } = scope.primeManifest();

    render(
      <PluginProvider>
        <div>app-shell</div>
      </PluginProvider>,
    );

    await waitFor(() => expect(usePluginState.getState().plugins).toHaveLength(1));

    expect(scope.hoisted.setRemoteMock).toHaveBeenCalledWith(
      name,
      expect.objectContaining({ format: 'esm', from: 'vite' }),
    );
    expect(scope.hoisted.getRemoteMock).toHaveBeenCalledWith(name, './plugin');

    const remoteConfig = scope.hoisted.setRemoteMock.mock.calls.at(-1)?.[1] as { url: () => Promise<string> };
    await expect(remoteConfig.url()).resolves.toBe(
      `http://test.local/api/plugins/${name}/frontend/module-federation/index.js?v=1.0.0`,
    );
  });
}

export function registerSkipsPluginsWithoutAFrontendEntryPoint(scope: PluginProviderTestScope): void {
  it('skips plugins without a frontend entry point', async () => {
    scope.primeManifest({ entryPoint: undefined });

    render(<PluginProvider />);

    await waitFor(() => expect(scope.hoisted.refetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(scope.hoisted.setRemoteMock).not.toHaveBeenCalled();
    expect(usePluginState.getState().plugins).toHaveLength(0);
  });
}
