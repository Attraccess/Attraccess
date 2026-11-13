import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDeleteAccount } from './index';
const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  pending: false,
  existing: [] as string[],
  options: {} as { onSuccess: () => void; onError: (error: Error) => void },
}));
const t = (key: string, vars?: { email?: string }) => (vars?.email ? `${key}:${vars.email}` : key);
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t, tExists: (key: string) => state.existing.includes(key) }),
    useUrlQuery: () => state.query,
  }))()),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceGetCurrentKey: 'current-user',
  useUsersServiceConfirmDeleteAccount: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate, isPending: state.pending };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.query = new URLSearchParams('token=one-use-token&email=user%40example.com');
  state.pending = false;
  state.existing = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function mount() {
  return render(
    <MemoryRouter initialEntries={['/confirm-delete-account']}>
      <ConfirmDeleteAccount />
      <Location />
    </MemoryRouter>,
  );
}
const apiError = (message: string) => Object.assign(new Error(message), { body: { message } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

it('never calls the mutation on mount, rerender or after timers', () => {
  vi.useFakeTimers();
  const view = mount();
  view.rerender(
    <MemoryRouter>
      <ConfirmDeleteAccount />
    </MemoryRouter>,
  );
  act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.getByText('confirm.title')).toBeTruthy();
  expect(screen.getByText('confirm.description:user@example.com')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'confirm.action' })).toBeTruthy();
});

it('cancels to the start page without an API call, also with Escape', () => {
  mount();
  press('confirm.cancel');
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(state.mutate).not.toHaveBeenCalled();
  cleanup();
  mount();
  fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('sends one request with the link parameters on confirm', () => {
  mount();
  press('confirm.action');
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({
    requestBody: { token: 'one-use-token', email: 'user@example.com' },
  });
});

it('does not send a second request while pending and disables Cancel', () => {
  state.pending = true;
  mount();
  expect(screen.getByRole('button', { name: 'confirm.cancel' })).toBeDisabled();
  press('confirm.action');
  expect(state.mutate).not.toHaveBeenCalled();
});

it('shows success, invalidates the current user and returns to login', () => {
  mount();
  act(() => state.options.onSuccess());
  expect(screen.getByText('success.title')).toBeTruthy();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['current-user'] });
  press('success.backToLogin');
  expect(screen.getByTestId('location')).toHaveTextContent('/');
});

it('offers an explicit retry after a retryable error and then shows success', () => {
  mount();
  act(() => state.options.onError(new Error('server failed')));
  expect(screen.getByText('apiErrors.unexpectedError')).toBeTruthy();
  press('error.tryAgain');
  expect(state.mutate).toHaveBeenCalledOnce();
  act(() => state.options.onSuccess());
  expect(screen.getByText('success.title')).toBeTruthy();
});

it('does not offer a retry for invalid or expired tokens', () => {
  state.existing = ['apiErrors.DeleteAccountTokenExpiredException'];
  mount();
  act(() => state.options.onError(apiError('DeleteAccountTokenExpiredException')));
  expect(screen.getByText('apiErrors.DeleteAccountTokenExpiredException')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'error.tryAgain' })).toBeNull();
  press('error.backToLogin');
  expect(screen.getByTestId('location')).toHaveTextContent('/');
});

it.each(['token=&email=', 'token=abc', ''])('shows the invalid link dialog for "%s" without an API call', (search) => {
  state.query = new URLSearchParams(search);
  mount();
  expect(screen.getByText('apiErrors.invalidLink')).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'error.tryAgain' })).toBeNull();
  press('error.backToLogin');
  expect(screen.getByTestId('location')).toHaveTextContent('/');
});
