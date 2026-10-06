// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ApiTokensCard } from './index';
const state = vi.hoisted(() => ({
  loading: false,
  error: false,
  total: 0,
  tokens: [] as {
    id: number;
    name: string;
    permissionKeys: string[];
    lastUsedAt: string | null;
    expiresAt: string | null;
  }[],
  query: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
  clipboard: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useDateTimeLocale: () => 'en-GB',
  useTranslations: () => ({
    t: (key: string, params?: { name?: string }) => (params?.name ? `${key}:${params.name}` : key),
  }),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));
vi.mock('../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({ permissionLabel: (key: string) => key }),
}));
vi.mock('../../../components/permissionPicker', () => ({
  PermissionPicker: ({
    permissions,
    onChange,
  }: {
    permissions: { key: string }[];
    onChange: (keys: Set<string>) => void;
  }) => (
    <div>
      {permissions.map((permission) => (
        <button key={permission.key} onClick={() => onChange(new Set([permission.key]))}>
          {permission.key}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListPermissions: () => ({ data: [{ key: 'resources.view' }, { key: 'users.delete' }] }),
  useApiTokensServiceListApiTokens: (params: unknown) => {
    state.query(params);
    return {
      data: { data: state.tokens, total: state.total },
      isPending: state.loading,
      isError: state.error,
      refetch: state.refetch,
    };
  },
  useApiTokensServiceCreateApiToken: () => ({ mutateAsync: state.create }),
  useApiTokensServiceRevokeApiToken: () => ({ mutateAsync: state.revoke }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.error = false;
  state.total = 0;
  state.tokens = [];
  state.create.mockResolvedValue({ token: 'secret-token' });
  state.revoke.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: state.clipboard.mockResolvedValue(undefined) },
  });
});
afterEach(cleanup);
function open() {
  return render(<ApiTokensCard availablePermissions={['resources.view']} />);
}
it('shows loading, empty results and list failures', () => {
  state.loading = true;
  const view = open();
  expect(view.container.querySelector('.skeleton')).toBeTruthy();
  view.unmount();
  state.loading = false;
  state.error = true;
  open();
  expect(screen.getByText('empty')).toBeTruthy();
  expect(state.toast).toHaveBeenCalledWith({ title: 'errors.loadFailed', type: 'error' });
});
it('creates a scoped token, exposes its secret once and copies it', async () => {
  open();
  expect(screen.queryByRole('button', { name: 'users.delete' })).toBeNull();
  expect(screen.getByRole('button', { name: 'actions.create' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: ' Integration ' } });
  fireEvent.click(screen.getByRole('button', { name: 'resources.view' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
  expect(await screen.findByDisplayValue('secret-token')).toBeTruthy();
  expect(state.create).toHaveBeenCalledWith({
    requestBody: { name: 'Integration', permissionKeys: ['resources.view'], expiresAt: undefined },
  });
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('nameLabel')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.copied', type: 'success' }));
  expect(state.clipboard).toHaveBeenCalledWith('secret-token');
  fireEvent.click(screen.getByRole('button', { name: 'actions.dismiss' }));
  expect(screen.queryByDisplayValue('secret-token')).toBeNull();
});
it('keeps form input after creation fails', async () => {
  state.create.mockRejectedValue(new Error('Unavailable'));
  open();
  fireEvent.change(screen.getByLabelText('nameLabel'), { target: { value: 'Integration' } });
  const user = userEvent.setup();
  for (const [segment, value] of [
    ['day', '01'],
    ['month', '01'],
    ['year', '2027'],
  ]) {
    await user.click(screen.getByRole('spinbutton', { name: new RegExp(`^${segment},`) }));
    await user.keyboard(value);
  }
  fireEvent.click(screen.getByRole('button', { name: 'resources.view' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.createFailed', type: 'error' }));
  expect(state.create).toHaveBeenCalledWith({
    requestBody: {
      name: 'Integration',
      permissionKeys: ['resources.view'],
      expiresAt: new Date('2027-01-01T00:00:00').toISOString(),
    },
  });
  expect(screen.getByLabelText('nameLabel')).toHaveValue('Integration');
  expect(screen.getByRole('spinbutton', { name: /^year,/ })).toHaveTextContent('2027');
  expect(state.refetch).not.toHaveBeenCalled();
});
it('blocks token creation with incomplete expiry segments and allows completion or clearing', async () => {
  state.create.mockRejectedValue(new Error('Unavailable'));
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('nameLabel'), 'Integration');
  await user.click(screen.getByRole('button', { name: 'resources.view' }));
  const create = screen.getByRole('button', { name: 'actions.create' });
  await user.click(screen.getByRole('spinbutton', { name: /^day,/ }));
  await user.keyboard('23');
  expect(create).toBeDisabled();
  for (const [segment, value] of [
    ['month', '11'],
    ['year', '2026'],
  ]) {
    await user.click(screen.getByRole('spinbutton', { name: new RegExp(`^${segment},`) }));
    await user.keyboard(value);
  }
  expect(create).toBeEnabled();
  await user.click(screen.getByRole('spinbutton', { name: /^day,/ }));
  await user.keyboard('{Backspace}{Backspace}');
  expect(create).toBeDisabled();
  expect(screen.getByText('invalidDate')).toBeInTheDocument();
  await user.click(create);
  expect(state.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('spinbutton', { name: /^day,/ }));
  await user.keyboard('24');
  expect(create).toBeEnabled();
  await user.click(create);
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith({
      requestBody: {
        name: 'Integration',
        permissionKeys: ['resources.view'],
        expiresAt: new Date('2026-11-24T00:00:00').toISOString(),
      },
    }),
  );
  await user.click(screen.getByRole('spinbutton', { name: /^day,/ }));
  await user.keyboard('{Backspace}{Backspace}');
  await user.click(screen.getByRole('button', { name: 'clearExpiry' }));
  expect(create).toBeEnabled();
  await user.click(create);
  await waitFor(() =>
    expect(state.create).toHaveBeenLastCalledWith({
      requestBody: { name: 'Integration', permissionKeys: ['resources.view'], expiresAt: undefined },
    }),
  );
});
it('shows token permissions and dates and handles revocation outcomes', async () => {
  state.tokens = [
    { id: 1, name: 'Integration', permissionKeys: ['resources.view'], lastUsedAt: null, expiresAt: null },
    { id: 2, name: 'Other', permissionKeys: [], lastUsedAt: '2026-09-01', expiresAt: '2027-01-01' },
  ];
  state.total = 2;
  open();
  expect(screen.getByText('neverUsed')).toBeTruthy();
  expect(screen.getByText('neverExpires')).toBeTruthy();
  expect(screen.getByText('2026-09-01')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.revoke:Integration' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.revoked', type: 'success' }));
  expect(state.revoke).toHaveBeenCalledWith({ id: 1 });
  expect(state.refetch).toHaveBeenCalledOnce();
  state.revoke.mockRejectedValue(new Error('Unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'actions.revoke:Other' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.revokeFailed', type: 'error' }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
