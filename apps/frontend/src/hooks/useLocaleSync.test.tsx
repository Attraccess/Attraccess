import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useLocaleSync } from './useLocaleSync';

const state = vi.hoisted(() => ({
  user: null as { id: number; locale?: string } | null,
  defaultLanguage: 'de' as 'en' | 'de',
  configured: true,
  setup: { available: false, stepsCompleted: { app: true } },
  mutate: vi.fn(),
}));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: !!state.user }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetSystemLanguage: () => ({
    data: { defaultLanguage: state.defaultLanguage, configured: state.configured },
  }),
  useSettingsServiceGetFirstTimeSetupStatus: () => ({ data: state.setup }),
  useUsersServiceUpdateMyLocale: () => ({ mutate: state.mutate }),
}));

beforeEach(() => {
  state.user = null;
  state.defaultLanguage = 'de';
  state.configured = true;
  state.setup = { available: false, stepsCompleted: { app: true } };
  state.mutate.mockClear();
  useTranslationState.setState({ language: 'en' });
});
afterEach(cleanup);

it('uses the system default for anonymous pages and responds to saved default changes', () => {
  const { rerender } = renderHook(useLocaleSync);
  expect(useTranslationState.getState().language).toBe('de');
  state.defaultLanguage = 'en';
  rerender();
  expect(useTranslationState.getState().language).toBe('en');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('preserves the browser suggestion before the first setup choice is saved', () => {
  state.setup = { available: true, stepsCompleted: { app: false } };
  state.configured = false;
  const { rerender } = renderHook(useLocaleSync);
  expect(useTranslationState.getState().language).toBe('en');
  state.configured = true;
  rerender();
  expect(useTranslationState.getState().language).toBe('de');
});

it('loads each user preference without overwriting it on login, then returns to the latest default on logout', () => {
  state.user = { id: 1, locale: 'de-DE' };
  const { rerender } = renderHook(useLocaleSync, {
    wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
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
  expect(useTranslationState.getState().language).toBe('en');
});

it('uses the system default for a user without a preference without saving it as a personal choice', () => {
  state.user = { id: 1 };
  renderHook(useLocaleSync);
  expect(useTranslationState.getState().language).toBe('de');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('applies refreshed server preferences without writing them back', () => {
  state.user = { id: 1, locale: 'de-DE' };
  const { rerender } = renderHook(useLocaleSync);
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
  const { rerender } = renderHook(useLocaleSync);
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
