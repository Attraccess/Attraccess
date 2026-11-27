import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  mcp: undefined as undefined | { url: string; oauthEnabled: boolean },
  grants: [] as { id: string }[],
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
  }))()),
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
  useGetMcpConnectionInfo: () => ({ data: state.mcp }),
  useListMcpOAuthGrants: () => ({ data: state.grants }),
  useRequestDeleteAccount: (_mutationKey: unknown, options: typeof state.options) => {
    state.options = options;
    return {
      mutateAsync: async () => {
        try {
          await state.request();
        } catch (error) {
          state.options.onError(error);
          throw error;
        }
        state.options.onSuccess();
      },
    };
  },
}));
vi.mock('./email', () => ({ EmailForm: () => <div>Email form</div> }));
vi.mock('./username', () => ({ UsernameForm: () => <div>Username form</div> }));
vi.mock('./name', () => ({ NameForm: () => <div>Name form</div> }));
vi.mock('./notifications', () => ({ NotificationPreferencesForm: () => <div>Notification form</div> }));
vi.mock('./two-factor', () => ({ TwoFactorCard: () => <div>Two-factor settings</div> }));
vi.mock('./passkeys', () => ({ PasskeysCard: () => <div>Passkey settings</div> }));
vi.mock('./api-tokens', () => ({
  ApiTokensCard: ({ availablePermissions }: { availablePermissions: string[] }) => (
    <div>Token permissions: {availablePermissions.join(',')}</div>
  ),
}));
vi.mock('./mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mcp')>()),
  McpConnectionCard: ({ connection, canUseApiTokens }: { connection: { url: string }; canUseApiTokens: boolean }) => (
    <div>
      MCP {connection.url} tokens:{String(canUseApiTokens)}
    </div>
  ),
}));
vi.mock('./mcp/McpGrantsCard', () => ({
  McpGrantsCard: ({ oauthEnabled }: { oauthEnabled: boolean }) => <div>Grants oauth:{String(oauthEnabled)}</div>,
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
  state.mcp = undefined;
  state.grants = [];
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
  expect(screen.queryByText('Email form')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /topics.profile.title/ }));
  expect(screen.getByText('Email form')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /topics.passkeys.title/ })).toBeNull();
  view.unmount();
  state.user = { id: 7, username: 'member', effectivePermissions: ['resources.view'] };
  const userView = open();
  fireEvent.click(screen.getByRole('button', { name: /topics.password.title/ }));
  expect(screen.getByText('Password for member #7')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /topics.twoFactor.title/ }));
  expect(screen.getByText('Two-factor settings')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /topics.passkeys.title/ }));
  expect(screen.getByText('Passkey settings')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /topics.tokens.title/ })).toBeNull();
  userView.unmount();
  state.permission = true;
  open();
  fireEvent.click(screen.getByRole('button', { name: /topics.tokens.title/ }));
  expect(screen.getByText('Token permissions: resources.view')).toBeTruthy();
});
it('requires confirmation for deletion, allows cancellation and closes after a successful request', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /topics.delete.title/ }));
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  expect(await screen.findByText('deleteAccount.modal.description')).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.cancel' }));
  expect(state.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  fireEvent.click(await screen.findByRole('button', { name: 'deleteAccount.actions.confirm' }));
  expect(state.request).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(state.success).toHaveBeenCalledWith({
      title: 'deleteAccount.toast.title',
      description: 'deleteAccount.toast.description',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('button', { name: 'deleteAccount.actions.confirm' })).toBeNull());
});
it('retains deletion confirmation and reports an unsuccessful request', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: /topics.delete.title/ }));
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.request' }));
  await screen.findByText('deleteAccount.modal.description');
  const failure = new Error('Unavailable');
  state.request.mockRejectedValueOnce(failure);
  fireEvent.click(screen.getByRole('button', { name: 'deleteAccount.actions.confirm' }));
  await waitFor(() =>
    expect(state.apiError).toHaveBeenCalledWith(
      expect.objectContaining({ error: failure, baseTranslationKey: 'apiErrors' }),
    ),
  );
  expect(screen.getByRole('button', { name: 'deleteAccount.actions.confirm' })).toBeTruthy();
  expect(state.success).not.toHaveBeenCalled();
});
it('offers the MCP topic only when the user can sign in to it with OAuth or an API token', () => {
  state.user = { id: 7, username: 'member', effectivePermissions: [] };
  state.mcp = { url: 'http://192.168.1.50:3000/api/mcp', oauthEnabled: false };
  const lanView = open();
  expect(screen.queryByRole('button', { name: /topics.mcp.title/ })).toBeNull();
  lanView.unmount();

  state.permission = true;
  const tokenView = open();
  fireEvent.click(screen.getByRole('button', { name: /topics.mcp.title/ }));
  expect(screen.getByText('MCP http://192.168.1.50:3000/api/mcp tokens:true')).toBeTruthy();
  tokenView.unmount();

  state.permission = false;
  state.mcp = { url: 'https://attraccess.example/api/mcp', oauthEnabled: true };
  open();
  fireEvent.click(screen.getByRole('button', { name: /topics.mcp.title/ }));
  expect(screen.getByText('MCP https://attraccess.example/api/mcp tokens:false')).toBeTruthy();
  expect(screen.getByText('Grants oauth:true')).toBeTruthy();
});
it('keeps the MCP topic for revoking connected apps when this address offers no way to connect', () => {
  state.user = { id: 7, username: 'member', effectivePermissions: [] };
  state.mcp = { url: 'http://192.168.1.50:3000/api/mcp', oauthEnabled: false };
  state.grants = [{ id: 'g1' }];
  open();
  fireEvent.click(screen.getByRole('button', { name: /topics.mcp.title/ }));
  expect(screen.getByText('Grants oauth:false')).toBeTruthy();
  expect(screen.queryByText(/^MCP http/)).toBeNull();
});
