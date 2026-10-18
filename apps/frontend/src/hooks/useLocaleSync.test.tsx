import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useLocaleSync } from './useLocaleSync';

type LocaleSaveContext = { userId: number | null | undefined; generation: number };
type LocaleVariables = { requestBody: { locale: string } };
type SavedUser = { id: number; locale: string };
type MutationOptions = {
  onMutate?: () => LocaleSaveContext;
  onSuccess?: (user: SavedUser, variables: LocaleVariables, context: LocaleSaveContext | undefined) => void;
};

const state = vi.hoisted(() => ({
  user: null as { id: number; locale?: string } | null,
  defaultLanguage: 'de' as 'en' | 'de',
  configured: true,
  setup: { available: false, stepsCompleted: { app: true } },
  mutate: vi.fn(),
  mutationOptions: undefined as MutationOptions | undefined,
  pending: [] as Array<{
    variables: LocaleVariables;
    context: LocaleSaveContext | undefined;
    options: MutationOptions | undefined;
  }>,
}));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: !!state.user }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetSystemLanguage: () => ({
    data: { defaultLanguage: state.defaultLanguage, configured: state.configured },
  }),
  useSettingsServiceGetFirstTimeSetupStatus: () => ({ data: state.setup }),
  UseUsersServiceGetCurrentKeyFn: () => ['current-user'],
  useUsersServiceUpdateMyLocale: (options: typeof state.mutationOptions) => {
    state.mutationOptions = options;
    return { mutate: state.mutate };
  },
}));

let queryClient: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const renderLocaleSync = () => renderHook(useLocaleSync, { wrapper });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] });
  state.user = null;
  state.defaultLanguage = 'de';
  state.configured = true;
  state.setup = { available: false, stepsCompleted: { app: true } };
  state.pending = [];
  state.mutate.mockReset().mockImplementation((variables: LocaleVariables) => {
    state.pending.push({ variables, context: state.mutationOptions?.onMutate?.(), options: state.mutationOptions });
  });
  queryClient = new QueryClient();
  useTranslationState.setState({ language: 'en', explicitLanguage: undefined });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('uses the system default for anonymous pages and responds to saved default changes', () => {
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('de');
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('preserves the browser suggestion before the first setup choice is saved', () => {
  state.setup = { available: true, stepsCompleted: { app: false } };
  state.configured = false;
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('en');
  state.configured = true;
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
});

it('loads each user preference without overwriting it on login, then retains the explicit browser choice on logout', () => {
  state.user = { id: 1, locale: 'de-DE' };
  const { rerender } = renderHook(useLocaleSync, {
    wrapper: ({ children }: PropsWithChildren) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </StrictMode>
    ),
  });
  expect(useTranslationState.getState().language).toBe('de');
  expect(state.mutate).not.toHaveBeenCalled();
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
  state.user = { id: 2, locale: 'en-US' };
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ requestBody: { locale: 'de' } });
  state.user = null;
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
});

it('uses the system default for a user without a preference without saving it as a personal choice', () => {
  state.user = { id: 1 };
  renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('de');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('applies refreshed server preferences without writing them back', () => {
  state.user = { id: 1, locale: 'de-DE' };
  const { rerender } = renderLocaleSync();
  state.user = { id: 1, locale: 'en-US' };
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ requestBody: { locale: 'de' } });
  rerender(); // An unchanged server snapshot must not undo a local selection.
  expect(useTranslationState.getState().language).toBe('de');
  state.user = { id: 1, locale: 'de' };
  rerender();
  expect(state.mutate).toHaveBeenCalledTimes(1);
});

it('follows refreshed defaults until the user has a personal preference', () => {
  state.user = { id: 1 };
  const { rerender } = renderLocaleSync();
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  state.user = { id: 1, locale: 'de' };
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
  state.user = { id: 1 };
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
});

it.each(['en-US', 'de-AT'])('keeps supported browser language %s when the default changes', (locale) => {
  vi.stubGlobal('navigator', { language: locale, languages: [locale] });
  const { rerender } = renderLocaleSync();
  const expected = locale.startsWith('de') ? 'de' : 'en';
  expect(useTranslationState.getState().language).toBe(expected);
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe(expected);
  state.defaultLanguage = 'de';
  rerender();
  expect(useTranslationState.getState().language).toBe(expected);
  expect(localStorage.getItem('language')).toBeNull();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('uses the first supported browser language and retains explicit guest selections', () => {
  vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR', 'en-GB', 'de-DE'] });
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('en');
  act(() => useTranslationState.getState().setLanguage('de'));
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('uses browser detection for missing or unsupported user languages, then the system fallback', () => {
  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  state.user = { id: 1, locale: 'fr' };
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('en');
  state.user = { id: 2 };
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  vi.stubGlobal('navigator', { language: 'fr', languages: ['fr'] });
  state.user = { id: 3, locale: 'en-!!!' };
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
  expect(state.mutate.mock.calls).toEqual([[{ requestBody: { locale: 'en' } }], [{ requestBody: { locale: 'en' } }]]);
});

it('returns to the browser language on logout when it differs from the user and system languages', () => {
  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  state.user = { id: 1, locale: 'de' };
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('de');
  state.user = null;
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('keeps a newly registered undetermined preference following changing defaults', () => {
  vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] });
  state.user = { id: 4, locale: 'und' };
  const { rerender } = renderLocaleSync();
  expect(useTranslationState.getState().language).toBe('de');
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
});

it.each(['de', 'en'] as const)(
  'keeps an explicit %s choice when storage is blocked, including the displayed fallback',
  (choice) => {
    state.user = { id: 1, locale: 'und' };
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    const { rerender } = renderLocaleSync();
    act(() => useTranslationState.getState().setLanguage(choice));
    expect(state.mutate).toHaveBeenCalledExactlyOnceWith({ requestBody: { locale: choice } });
    state.defaultLanguage = 'en';
    rerender();
    state.defaultLanguage = 'de';
    rerender();
    expect(useTranslationState.getState().language).toBe(choice);
  },
);

it('updates only the matching cached user locale after a successful save', () => {
  state.user = { id: 1, locale: 'und' };
  const cachedUser = { ...state.user, effectivePermissions: ['resources.view'] };
  queryClient.setQueryData(['current-user'], cachedUser);
  renderLocaleSync();
  act(() => useTranslationState.getState().setLanguage('en'));
  act(() => completeSave(0, { id: 1, locale: 'en' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual({ ...cachedUser, locale: 'en' });
  const otherUser = { id: 2, locale: 'de' };
  queryClient.setQueryData(['current-user'], otherUser);
  act(() => completeSave(0, { id: 1, locale: 'en' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual(otherUser);
});

function completeSave(index: number, user: SavedUser) {
  const pending = state.pending[index];
  pending.options?.onSuccess?.(user, pending.variables, pending.context);
}

it('ignores older saves that complete before or after the latest explicit choice', () => {
  state.user = { id: 1, locale: 'und' };
  queryClient.setQueryData(['current-user'], state.user);
  renderLocaleSync();
  act(() => useTranslationState.getState().setLanguage('de'));
  act(() => useTranslationState.getState().setLanguage('en'));
  act(() => completeSave(0, { id: 1, locale: 'de' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 1, locale: 'und' });
  act(() => completeSave(1, { id: 1, locale: 'en' }));
  act(() => completeSave(0, { id: 1, locale: 'de' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 1, locale: 'en' });
  expect(useTranslationState.getState().language).toBe('en');
});

it('ignores a detected browser preference superseded by an explicit choice', () => {
  vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] });
  state.user = { id: 1, locale: 'und' };
  queryClient.setQueryData(['current-user'], state.user);
  renderLocaleSync();
  act(() => useTranslationState.getState().setLanguage('en'));
  act(() => completeSave(1, { id: 1, locale: 'en' }));
  act(() => completeSave(0, { id: 1, locale: 'de' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 1, locale: 'en' });
});

it('ignores a previous session save even after the same user logs back in', () => {
  state.user = { id: 1, locale: 'und' };
  queryClient.setQueryData(['current-user'], state.user);
  const { rerender } = renderLocaleSync();
  act(() => useTranslationState.getState().setLanguage('de'));
  state.user = null;
  rerender();
  state.user = { id: 1, locale: 'en' };
  queryClient.setQueryData(['current-user'], state.user);
  rerender();
  act(() => completeSave(0, { id: 1, locale: 'de' }));
  expect(queryClient.getQueryData(['current-user'])).toEqual({ id: 1, locale: 'en' });
});
