import type { ComponentProps } from 'react';
import { ApiError, AuthenticationType } from '@attraccess/react-query-client';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AcceptInvitation } from './accept-invitation';
import { CreateAdminStep } from './first-time-setup/steps/CreateAdminStep';
import type { PasswordField } from '../components/PasswordField';
const state = vi.hoisted(() => ({
  accept: vi.fn(),
  create: vi.fn(),
  login: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  invalidate: vi.fn(),
  callbacks: {} as Record<string, { onSuccess: (user: { username: string }) => void; onError: (error: Error) => void }>,
}));
vi.mock('../hooks/useAuth', () => ({ useLogin: () => ({ mutate: state.login }) }));
vi.mock('../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useUsersServiceAcceptInvitation: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.accept = callbacks;
    return { mutate: state.accept, isPending: false };
  },
  useUsersServiceCreateOneUser: (callbacks: (typeof state.callbacks)[string]) => {
    state.callbacks.create = callbacks;
    return { mutate: state.create, isPending: false };
  },
  UseUsersServiceFindManyKeyFn: () => ['users'],
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn: () => ['setup'],
}));
vi.mock('../components/PasswordField', () => ({
  PasswordField: ({
    value,
    onValueChange,
    confirmationValue,
    onConfirmationChange,
    passwordLabel,
    confirmationLabel,
    serverErrors,
  }: ComponentProps<typeof PasswordField>) => (
    <div>
      <label>
        {passwordLabel}
        <input required value={value} onChange={(event) => onValueChange(event.target.value)} />
      </label>
      <label>
        {confirmationLabel}
        <input required value={confirmationValue} onChange={(event) => onConfirmationChange?.(event.target.value)} />
      </label>
      <output>{JSON.stringify(serverErrors)}</output>
    </div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.callbacks = {};
});
afterEach(cleanup);
function policyError() {
  return new ApiError(
    { method: 'POST', url: '/users' },
    {
      url: '/users',
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      body: { policyErrors: [{ code: 'minLength', message: 'Too short' }] },
    },
    'Policy rejected',
  );
}
function invitation(path = '/accept?token=invitation-token&email=alex%40example.test') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accept" element={<AcceptInvitation />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('validates invitation passwords, submits its token and logs in after acceptance', () => {
  invitation();
  fireEvent.change(screen.getByLabelText('Choose a Password'), { target: { value: 'secure-password' } });
  fireEvent.change(screen.getByLabelText('Confirm your Password'), { target: { value: 'mismatch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));
  expect(state.accept).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirm your Password'), { target: { value: 'secure-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Accept Invitation' }));
  expect(state.accept).toHaveBeenCalledWith({
    requestBody: { token: 'invitation-token', email: 'alex@example.test', password: 'secure-password' },
  });
  act(() => state.callbacks.accept.onSuccess({ username: 'alex' }));
  expect(state.login).toHaveBeenCalledWith({ username: 'alex', password: 'secure-password', tokenLocation: 'cookie' });
  expect(screen.getByText('Home')).toBeTruthy();
  expect(state.success).toHaveBeenCalledWith({ title: 'Invitation Accepted', description: 'Welcome to Attraccess!' });
});
it('shows missing invitation parameters and policy errors without generic error feedback', () => {
  const view = invitation('/accept?token=only');
  expect(screen.getByText('Token or email not found')).toBeTruthy();
  view.unmount();
  invitation();
  act(() => state.callbacks.accept.onError(policyError()));
  expect(screen.getByRole('status')).toHaveTextContent('minLength');
  expect(state.apiError).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Choose a Password'), { target: { value: 'longer-password' } });
  expect(screen.getByRole('status')).toHaveTextContent('[]');
  const error = new Error('Expired');
  act(() => state.callbacks.accept.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
});
it.each([false, true])(
  'creates the first administrator and refreshes setup state (overwrite=%s)',
  async (isOverwrite) => {
    const success = vi.fn();
    render(
      <MemoryRouter>
        <CreateAdminStep isOverwrite={isOverwrite} onSuccess={success} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Create admin account' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Username/ }), { target: { value: 'admin-user' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/ }), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith({
        requestBody: {
          username: 'admin-user',
          email: 'admin@example.test',
          password: 'secure-password',
          strategy: AuthenticationType.LOCAL_PASSWORD,
          ...(isOverwrite ? { overwriteFirstTimeAdmin: true } : {}),
        },
      }),
    );
    act(() => state.callbacks.create.onSuccess({ username: 'admin-user' }));
    expect(success).toHaveBeenCalledOnce();
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['setup'] });
  },
);
it('presents first-admin policy and API errors and clears policy errors on edits', () => {
  render(
    <MemoryRouter>
      <CreateAdminStep />
    </MemoryRouter>,
  );
  act(() => state.callbacks.create.onError(policyError()));
  expect(screen.getByRole('status')).toHaveTextContent('minLength');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
  expect(screen.getByRole('status')).toHaveTextContent('[]');
  const error = new Error('Unavailable');
  act(() => state.callbacks.create.onError(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
});
