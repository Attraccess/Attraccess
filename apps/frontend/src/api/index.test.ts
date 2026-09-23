import { afterEach, expect, it, vi } from 'vitest';
import { PluginsService } from '@attraccess/react-query-client';
import { configureApiClient } from './index';

afterEach(() => vi.unstubAllGlobals());

it('keeps a scoped npm package name in one API path segment', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();

  await PluginsService.pluginControllerInstallPackage({
    packageName: '@attraccess/plugin-rabbitmq',
    version: '0.1.0-nightly.925.2',
    requestBody: { registryId: 'npm' },
  });

  expect(fetchMock.mock.calls[0][0]).toContain(
    '/api/plugins/npm/%40attraccess%2Fplugin-rabbitmq/versions/0.1.0-nightly.925.2',
  );
});
