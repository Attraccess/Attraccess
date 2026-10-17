import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  UseUsersServiceGetOneUserByIdKeyFn,
  useUsersServiceGetCurrentKey,
  useUsersServiceGetOneUserByIdKey,
  useUsersServiceFindManyKey,
} from '@attraccess/react-query-client';
import { EmailForm } from './email';
import { UsernameForm } from './username';
import { ChangeEmailForm } from '../user-management/details/components/changeEmail';
import { ChangeUsernameForm } from '../user-management/details/components/changeUsername';
const state = vi.hoisted(() => ({
  user: { username: 'member', email: 'member@example.test' },
  mutate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@attraccess/react-query-client')>();
  const mutation = (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate };
  };
  return {
    ...actual,
    useUsersServiceGetCurrent: () => ({ data: state.user }),
    useUsersServiceGetOneUserById: () => ({ data: state.user }),
    useUsersServiceChangeMyEmail: mutation,
    useUsersServiceChangeMyUsername: mutation,
    useUsersServiceChangeUserEmail: mutation,
    useUsersServiceChangeUserUsername: mutation,
  };
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function apiError(message: unknown) {
  return new ApiError(
    { method: 'POST', url: '/users' },
    { url: '/users', ok: false, status: 400, statusText: 'Bad Request', body: { message } },
    'Rejected',
  );
}
describe.each([
  { name: 'my email', email: true, admin: false, component: <EmailForm /> },
  { name: 'user email', email: true, admin: true, component: <ChangeEmailForm userId={7} /> },
  { name: 'my username', email: false, admin: false, component: <UsernameForm /> },
  { name: 'user username', email: false, admin: true, component: <ChangeUsernameForm userId={7} /> },
])('$name', ({ component, email, admin }) => {
  it('saves the edited value and refreshes affected user data', async () => {
    render(component);
    const label = email ? (admin ? 'email.label' : 'email.newLabel') : 'username.label';
    const input = screen.getByRole('textbox', { name: label });
    if (email) {
      expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
      fireEvent.change(input, { target: { value: 'bad-address' } });
      expect(screen.getByRole('button', { name: 'actions.save' })).toBeDisabled();
    } else expect(input).toHaveValue('member');
    fireEvent.change(input, { target: { value: email ? ' new@example.test ' : 'new-name' } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    if (email) {
      expect(await screen.findByText('modal.warning')).toBeTruthy();
      expect(state.mutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
      expect(state.mutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
      fireEvent.click(await screen.findByRole('button', { name: 'actions.confirm' }));
    }
    expect(state.mutate).toHaveBeenCalledWith({
      ...(admin ? { id: 7 } : {}),
      requestBody: email ? { email: 'new@example.test' } : { username: 'new-name' },
    });
    act(() => state.options.onSuccess());
    expect(state.invalidate.mock.calls).toEqual(
      admin
        ? [
            [{ queryKey: email ? UseUsersServiceGetOneUserByIdKeyFn({ id: 7 }) : [useUsersServiceGetOneUserByIdKey] }],
            [{ queryKey: [useUsersServiceFindManyKey] }],
          ]
        : [[{ queryKey: [useUsersServiceGetCurrentKey] }]],
    );
    expect(state.success).toHaveBeenCalledWith({ title: 'messages.updated' });
  });
  it('shows server validation, transport and fallback errors without treating them as success', () => {
    render(component);
    for (const [failure, expected] of [
      [apiError(['Already taken', 'Other']), 'Already taken'],
      [apiError('Unavailable'), 'Unavailable'],
      [apiError('  '), 'errors.updateFailed'],
      [new Error('Network offline'), 'Network offline'],
      [{}, 'errors.updateFailed'],
    ] as const) {
      act(() => state.options.onError(failure));
      expect(state.error).toHaveBeenLastCalledWith({ title: expected });
    }
    if (!email) {
      act(() => state.options.onError(apiError('Allowed ONCE PER DAY')));
      expect(state.error).toHaveBeenLastCalledWith({ title: 'errors.oncePerDay' });
    }
    expect(state.success).not.toHaveBeenCalled();
    expect(state.invalidate).not.toHaveBeenCalled();
  });
});
