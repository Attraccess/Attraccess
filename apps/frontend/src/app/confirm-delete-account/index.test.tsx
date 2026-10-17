import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDeleteAccount } from './index';
const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  pending: false,
  options: {} as { onSuccess: () => void; onError: (error: Error) => void },
}));
const t = (key: string) => key;
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t, tExists: () => false }),
  useUrlQuery: () => state.query,
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
it('submits confirmation only once across rerenders and clears the current-user cache after success', () => {
  const view = mount();
  expect(state.mutate).toHaveBeenCalledExactlyOnceWith({
    requestBody: { token: 'one-use-token', email: 'user@example.com' },
  });
  view.rerender(
    <MemoryRouter>
      <ConfirmDeleteAccount />
      <Location />
    </MemoryRouter>,
  );
  expect(state.mutate).toHaveBeenCalledOnce();
  act(() => state.options.onSuccess());
  expect(screen.getByText('success.title')).toBeTruthy();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['current-user'] });
  fireEvent.click(screen.getByRole('button', { name: 'success.backToLogin' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/');
});
it('allows an explicit retry after an API failure and then shows success', () => {
  mount();
  act(() => state.options.onError(new Error('server failed')));
  expect(screen.getByText('apiErrors.unexpectedError')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'error.tryAgain' }));
  expect(state.mutate).toHaveBeenCalledTimes(2);
  act(() => state.options.onSuccess());
  expect(screen.queryByText('error.title')).toBeNull();
  expect(screen.getByText('success.title')).toBeTruthy();
});
it('rejects empty confirmation parameters without an API call', () => {
  state.query = new URLSearchParams('token=&email=');
  mount();
  expect(screen.getByText('apiErrors.invalidLink')).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'error.tryAgain' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'error.backToLogin' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/');
});
it('reports a missing mutation result after the fallback timeout', () => {
  vi.useFakeTimers();
  mount();
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByText('apiErrors.unexpectedError')).toBeTruthy();
});
it('does not time out a pending request or send a request with missing parameters', () => {
  vi.useFakeTimers();
  state.pending = true;
  const view = mount();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByText('apiErrors.unexpectedError')).toBeNull();
  view.unmount();
  state.query = new URLSearchParams();
  state.mutate.mockClear();
  mount();
  expect(state.mutate).not.toHaveBeenCalled();
});
