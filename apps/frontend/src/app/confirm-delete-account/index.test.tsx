import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDeleteAccount } from './index';
import en from './en.json';
import de from './de.json';
const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  reset: vi.fn(),
  currentUser: undefined as { status: string; fetchStatus: string } | undefined,
  pending: false,
  existing: [] as string[],
  options: {} as { onSuccess: () => void; onError: (error: Error) => void; onSettled: () => void },
}));
const t = (key: string, vars?: { email?: string; retryAfterSeconds?: number }) =>
  [key, vars?.email ?? vars?.retryAfterSeconds].filter((part) => part !== undefined).join(':');
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t,
    tMessage: (message: { key: string; data?: Parameters<typeof t>[1] }) => t(message.key, message.data),
    tExists: (key: string, options?: { succeedIfKeyIsObject?: boolean }) =>
      state.existing.includes(key) ||
      (!!options?.succeedIfKeyIsObject && state.existing.some((existing) => existing.startsWith(`${key}.`))),
  }),
  useUrlQuery: () => state.query,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: state.invalidate,
    resetQueries: state.reset,
    getQueryState: () => state.currentUser,
  }),
}));
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
  state.currentUser = { status: 'error', fetchStatus: 'idle' };
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
const expectStartPage = () => expect(screen.getByTestId('location').textContent).toBe('/');
const keys = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

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
  expect(screen.getByRole('button', { name: 'confirm.action' }).className).toContain('button--danger');
  expect(screen.getByRole('button', { name: 'confirm.cancel' })).toBeTruthy();
});

it('cancels to the start page without an API call, also with Escape', () => {
  mount();
  press('confirm.cancel');
  expectStartPage();
  expect(state.mutate).not.toHaveBeenCalled();
  cleanup();
  mount();
  fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
  expectStartPage();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('sends one request with the link parameters on confirm', () => {
  mount();
  press('confirm.action');
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({
    requestBody: { token: 'one-use-token', email: 'user@example.com' },
  });
});

it('sends only one request when Delete is pressed twice before the pending state renders', () => {
  mount();
  press('confirm.action');
  press('confirm.action');
  expect(state.mutate).toHaveBeenCalledOnce();
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
  expect(state.reset).not.toHaveBeenCalled();
  press('success.backToLogin');
  expect(state.reset).toHaveBeenCalledWith({ queryKey: ['current-user'] });
  expectStartPage();
});

it('keeps a different signed-in user when leaving the success dialog', () => {
  state.currentUser = { status: 'success', fetchStatus: 'idle' };
  mount();
  act(() => state.options.onSuccess());
  press('success.backToLogin');
  expect(state.reset).not.toHaveBeenCalled();
  expectStartPage();
});

it.each([
  ['an unexpected error', new Error('server failed'), 'apiErrors.unexpectedError'],
  ['active usage sessions', apiError('UserHasActiveUsageSessions'), 'apiErrors.UserHasActiveUsageSessions'],
])('offers an explicit retry after %s and then shows success', (_, error, message) => {
  state.existing = ['apiErrors.unexpectedError', 'apiErrors.UserHasActiveUsageSessions'];
  mount();
  press('confirm.action');
  act(() => {
    state.options.onError(error);
    state.options.onSettled();
  });
  expect(screen.getByText('error.title')).toBeTruthy();
  expect(screen.getByText(message)).toBeTruthy();
  press('error.tryAgain');
  expect(state.mutate).toHaveBeenCalledTimes(2);
  expect(state.mutate).toHaveBeenLastCalledWith({
    requestBody: { token: 'one-use-token', email: 'user@example.com' },
  });
  act(() => state.options.onSuccess());
  expect(screen.getByText('success.title')).toBeTruthy();
});

it.each([
  'DeleteAccountTokenInvalidException',
  'DeleteAccountTokenExpiredException',
  'Cannot delete the last administrator',
])('does not offer a retry for %s', (message) => {
  state.existing = [`apiErrors.${message}`];
  mount();
  act(() => state.options.onError(apiError(message)));
  expect(screen.getByText(`apiErrors.${message}`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'error.tryAgain' })).toBeNull();
  press('error.backToLogin');
  expectStartPage();
});

it('shows the description of an error that translates to a title and description, and allows a retry', () => {
  state.existing = ['apiErrors.TooManyAuthAttempts.title', 'apiErrors.TooManyAuthAttempts.description'];
  mount();
  act(() => state.options.onError(Object.assign(new Error('429'), { body: { message: 'TooManyAuthAttempts' } })));
  expect(screen.getByText('apiErrors.TooManyAuthAttempts.description')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'error.tryAgain' })).toBeTruthy();
});

it('shows the rate limit message with the waiting time', () => {
  state.existing = ['apiErrors.TooManyAuthAttempts'];
  mount();
  act(() =>
    state.options.onError(
      Object.assign(new Error('429'), { body: { message: 'TooManyAuthAttempts', retryAfterSeconds: 30 } }),
    ),
  );
  expect(screen.getByText('apiErrors.TooManyAuthAttempts:30')).toBeTruthy();
});

it.each(['token=&email=', 'token=abc', '', 'token=abc&email=user%40example.com.%20Call%20us%20now'])(
  'shows the invalid link dialog for "%s" without an API call',
  (search) => {
    state.query = new URLSearchParams(search);
    mount();
    expect(screen.getByText('apiErrors.invalidLink')).toBeTruthy();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    press('error.backToLogin');
    expectStartPage();
  },
);

it('has the same translation keys in English and German', () => {
  expect(keys(de).sort()).toEqual(keys(en).sort());
});
