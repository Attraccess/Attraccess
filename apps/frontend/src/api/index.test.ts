import { afterEach, expect, it, vi } from 'vitest';
import {
  AuthenticationType,
  pluginControllerInstallPackage,
  getSystemLanguage,
  createOneUser,
} from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { configureApiClient } from './index';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  useTranslationState.setState({ language: 'en', explicitLanguage: undefined });
});

it.each(['getter', 'getItem'] as const)(
  'registers the session preference when the local storage %s throws',
  async (failure) => {
    sessionStorage.setItem('language', 'de');
    useTranslationState.setState({ language: 'en', explicitLanguage: undefined });
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
    const unavailable = () => {
      throw new Error('Storage unavailable');
    };
    if (failure === 'getter') vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(unavailable);
    else vi.stubGlobal('localStorage', { getItem: unavailable });
    const fetchMock = vi.fn(async (_request: Request) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    configureApiClient();

    await createOneUser({
      body: {
        username: 'registration-fixture',
        email: 'registration@example.com',
        password: 'fixture-password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      },
      throwOnError: true,
    }).then(({ data }) => data);
    expect(fetchMock.mock.calls[0][0].headers.get('Accept-Language')).toBe('de');
  },
);

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
    const fetchMock = vi.fn(async (_request: Request) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    configureApiClient();
    useTranslationState.setState({ language: 'de' });
    if (selection) useTranslationState.getState().setLanguage(selection);
    await createOneUser({
      body: {
        username: 'registration-fixture',
        email: 'registration@example.com',
        password: 'fixture-password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      },
      throwOnError: true,
    }).then(({ data }) => data);
    expect(fetchMock.mock.calls[0][0].headers.get('Accept-Language')).toBe(expected);
    await getSystemLanguage({ throwOnError: true }).then(({ data }) => data);
    expect(fetchMock.mock.calls[1][0].headers.get('Accept-Language')).toBe(selection ?? 'de');
  },
);

it('sends the current interface language, including changes after client configuration', async () => {
  const fetchMock = vi.fn(async (_request: Request) => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();
  useTranslationState.setState({ language: 'de' });
  await getSystemLanguage({ throwOnError: true }).then(({ data }) => data);
  expect(fetchMock.mock.calls[0][0].headers.get('Accept-Language')).toBe('de');
  useTranslationState.setState({ language: 'en' });
  await getSystemLanguage({ throwOnError: true }).then(({ data }) => data);
  expect(fetchMock.mock.calls[1][0].headers.get('Accept-Language')).toBe('en');
});

it.each([
  { browser: 'fr-FR', choice: 'en' as const },
  { browser: 'en-US', choice: 'de' as const },
])('registers an explicit $choice choice when browser storage is blocked', async ({ browser, choice }) => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('navigator', { language: browser, languages: [browser] });
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage unavailable');
    },
  });
  const fetchMock = vi.fn(async (_request: Request) => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();
  useTranslationState.getState().setLanguage(choice);
  await createOneUser({
    body: {
      username: 'registration-fixture',
      email: 'registration@example.com',
      password: 'fixture-password',
      strategy: AuthenticationType.LOCAL_PASSWORD,
    },
    throwOnError: true,
  }).then(({ data }) => data);
  expect(fetchMock.mock.calls[0][0].headers.get('Accept-Language')).toBe(choice);
});

it('keeps a scoped npm package name in one API path segment', async () => {
  const fetchMock = vi.fn(async (_request: Request) => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient();

  await pluginControllerInstallPackage({
    path: { packageName: '@attraccess/plugin-rabbitmq', version: '0.1.0-nightly.925.2' },
    body: { registryId: 'npm' },
    throwOnError: true,
  }).then(({ data }) => data);

  expect(fetchMock.mock.calls[0][0].url).toContain(
    '/api/plugins/npm/%40attraccess%2Fplugin-rabbitmq/versions/0.1.0-nightly.925.2',
  );
});
