import { afterEach, expect, it, vi } from 'vitest';
import { AuthenticationType, PluginsService, SettingsService, UsersService } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { configureApiClient } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  useTranslationState.setState({ language: 'en' });
});

it.each([
  { browser: ['fr-FR'], selection: undefined, expected: 'und' },
  { browser: ['fr-FR', 'en-US'], selection: undefined, expected: 'en' },
  { browser: ['fr-FR'], selection: 'en' as const, expected: 'en' },
])(
  'registers a known preference separately from the displayed fallback: $expected',
  async ({ browser, selection, expected }) => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('navigator', { language: browser[0], languages: browser });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    configureApiClient();
    useTranslationState.setState({ language: 'de' });
    if (selection) useTranslationState.getState().setLanguage(selection);
    await UsersService.createOneUser({
      requestBody: {
        username: 'registration-fixture',
        email: 'registration@example.com',
        password: 'fixture-password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      },
    });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Accept-Language')).toBe(expected);
    await SettingsService.getSystemLanguage();
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Accept-Language')).toBe(selection ?? 'de');
  },
);

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
