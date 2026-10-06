import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDateTimePreferences, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { DateTimePreferencesForm } from './index';
import { useDateTimePreferencesSync } from '../../../hooks/useDateTimePreferencesSync';

const state = vi.hoisted(() => ({
  revision: 0,
  listeners: new Set<() => void>(),
  user: { id: 1, dateTimeLocale: null as string | null },
  loading: false,
  pending: false,
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: (user: { id: number; dateTimeLocale: string | null }) => void; onError: () => void },
}));
vi.mock('@attraccess/react-query-client', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  };
  const useRevision = () => useSyncExternalStore(subscribe, () => state.revision);
  return {
    UseUsersServiceGetCurrentKeyFn: () => ['current-user'],
    useUsersServiceGetCurrent: () => {
      useRevision();
      return { data: state.user, isLoading: state.loading };
    },
    useUsersServiceUpdateMyDateTimePreferences: (options: typeof state.options) => {
      useRevision();
      state.options = options;
      return { mutate: state.save, isPending: state.pending };
    },
  };
});
vi.mock('../../../hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => {
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        },
        () => state.revision,
      );
      return { user: state.user };
    },
  };
});
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
// Test the form draft independently of the generic select's portal behavior.
vi.mock('../../../components/select', () => ({
  Select: ({
    label,
    value,
    items,
    onChange,
    isDisabled,
  }: {
    label: string;
    value: string;
    items: { key: string; label: string }[];
    onChange: (value: string) => void;
    isDisabled: boolean;
  }) => (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={isDisabled}>
        {items.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));
function notify() {
  act(() => {
    state.revision++;
    state.listeners.forEach((listener) => listener());
  });
}
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 1, dateTimeLocale: null };
  state.loading = false;
  state.pending = false;
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: null, userId: 1 });
  client = new QueryClient();
});
afterEach(() => {
  cleanup();
  client.clear();
});
function Form() {
  useDateTimePreferencesSync();
  return <DateTimePreferencesForm />;
}
function show() {
  return render(
    <QueryClientProvider client={client}>
      <Form />
    </QueryClientProvider>,
  );
}
function custom(locale: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: locale } });
}
it('validates drafts and isolates previews; only a canonical successful save changes account formatting', async () => {
  show();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  custom('en_US');
  expect(screen.getByText(/Enter a valid locale code/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  custom('zz-ZZ');
  expect(screen.getByText(/browser does not support/)).toBeTruthy();
  custom(' en-gb ');
  expect(useDateTimePreferences.getState().dateTimeLocale).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(state.save).toHaveBeenCalledWith({ requestBody: { dateTimeLocale: 'en-GB' } });
  act(() => state.options.onError());
  expect(state.error).toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue(' en-gb ');
  expect(useDateTimePreferences.getState().dateTimeLocale).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  act(() => state.options.onSuccess({ id: 1, dateTimeLocale: 'en-GB' }));
  expect(client.getQueryData(['current-user'])).toEqual({ id: 1, dateTimeLocale: 'en-GB' });
  expect(useDateTimePreferences.getState().dateTimeLocale).toBe('en-GB');
  expect(screen.getByRole('textbox')).toHaveValue('en-GB');
});
it('hydrates reloads, resets drafts across account identities, rejects stale saves, and persists null reset', async () => {
  state.user.dateTimeLocale = 'en-US';
  const view = show();
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('en-US'));
  custom('ja-JP');
  const stale = state.options.onSuccess;
  state.user = { id: 2, dateTimeLocale: 'en-US' };
  notify();
  view.rerender(
    <QueryClientProvider client={client}>
      <Form />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('textbox')).toHaveValue('en-US');
  act(() => stale({ id: 1, dateTimeLocale: 'ja-JP' }));
  expect(useDateTimePreferences.getState()).toMatchObject({ userId: 2, dateTimeLocale: 'en-US' });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'language' } });
  act(() => useTranslationState.getState().setLanguage('de'));
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
  expect(state.save).toHaveBeenCalledWith({ requestBody: { dateTimeLocale: null } });
  act(() => state.options.onSuccess({ id: 2, dateTimeLocale: null }));
  expect(useDateTimePreferences.getState().dateTimeLocale).toBeNull();
});
it('disables editing and saving while loading or pending', () => {
  state.loading = true;
  const view = show();
  expect(screen.getByRole('combobox')).toBeDisabled();
  state.loading = false;
  notify();
  view.rerender(
    <QueryClientProvider client={client}>
      <Form />
    </QueryClientProvider>,
  );
  custom('en-GB');
  state.pending = true;
  notify();
  view.rerender(
    <QueryClientProvider client={client}>
      <Form />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
