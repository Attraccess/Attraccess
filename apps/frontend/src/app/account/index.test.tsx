import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AccountPage from './index';
const state = vi.hoisted(() => ({
  user: undefined as undefined | { id: number; username: string; effectivePermissions?: string[] },
  permission: false,
  request: vi.fn(),
  success: vi.fn(),
  apiError: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: state.user,
    hasPermission: (permission: string) => permission === 'users.api-tokens.manage' && state.permission,
  }),
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.apiError }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceRequestDeleteAccount: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.request };
  },
}));
vi.mock('./email', () => ({ EmailForm: () => <div>Email form</div> }));
vi.mock('./username', () => ({ UsernameForm: () => <div>Username form</div> }));
vi.mock('./notifications', () => ({ NotificationPreferencesForm: () => <div>Notification form</div> }));
vi.mock('./two-factor', () => ({ TwoFactorCard: () => <div>Two-factor settings</div> }));
vi.mock('./passkeys', () => ({ PasskeysCard: () => <div>Passkey settings</div> }));
vi.mock('./api-tokens', () => ({
  ApiTokensCard: ({ availablePermissions }: { availablePermissions: string[] }) => (
    <div>Token permissions: {availablePermissions.join(',')}</div>
  ),
}));
vi.mock('../user-management/details/components/setPasswordForm', () => ({
  SetPasswordForm: ({ userId, username }: { userId: number; username: string }) => (
    <div>
      Password for {username} #{userId}
    </div>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.user = undefined;
  state.permission = false;
});
afterEach(cleanup);
function open() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );
}
it('shows profile settings and gates account security tools on the current user and permissions', () => {
  const view = open();
  expect(screen.getByText('Email form')).toBeTruthy();
  expect(screen.queryByText('Passkey settings')).toBeNull();
  view.unmount();
  state.user = { id: 7, username: 'member', effectivePermissions: ['resources.view'] };
  const userView = open();
  expect(screen.getByText('Password for member #7')).toBeTruthy();
  expect(screen.getByText('Two-factor settings')).toBeTruthy();
  expect(screen.getByText('Passkey settings')).toBeTruthy();
  expect(screen.queryByText(/Token permissions/)).toBeNull();
  userView.unmount();
  state.permission = true;
  open();
  expect(screen.getByText('Token permissions: resources.view')).toBeTruthy();
});
it('requires confirmation for deletion, allows cancellation and closes after a successful request', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  expect(await screen.findByText('deleteAccount.modal.description')).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.cancel' }));
  expect(state.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  fireEvent.click(await screen.findByRole('button', { name: 'deleteAccount.actions.confirm' }));
  expect(state.request).toHaveBeenCalledOnce();
  act(() => state.options.onSuccess());
  expect(state.success).toHaveBeenCalledWith({
    title: 'deleteAccount.toast.title',
    description: 'deleteAccount.toast.description',
  });
  expect(screen.queryByRole('button', { name: 'deleteAccount.actions.confirm' })).toBeNull();
});
it('retains deletion confirmation and reports an unsuccessful request', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  await screen.findByText('deleteAccount.modal.description');
  const failure = new Error('Unavailable');
  act(() => state.options.onError(failure));
  expect(state.apiError).toHaveBeenCalledWith(
    expect.objectContaining({ error: failure, baseTranslationKey: 'apiErrors' }),
  );
  expect(screen.getByRole('button', { name: 'deleteAccount.actions.confirm' })).toBeTruthy();
  expect(state.success).not.toHaveBeenCalled();
});
