import { afterEach, expect, it, vi } from 'vitest';
import { PluginsService, SettingsService } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { configureApiClient } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  useTranslationState.setState({ language: 'en' });
});

it('sends the current interface language, including changes after client configuration', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();
  useTranslationState.setState({ language: 'de' });
  await SettingsService.getSystemLanguage();
  expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Accept-Language')).toBe('de');
  useTranslationState.setState({ language: 'en' });
  await SettingsService.getSystemLanguage();
  expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Accept-Language')).toBe('en');
});

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
