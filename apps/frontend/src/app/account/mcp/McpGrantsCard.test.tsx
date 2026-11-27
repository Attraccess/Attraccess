// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { McpGrantsCard } from './McpGrantsCard';
import en from './en.json';
import de from './de.json';

const state = vi.hoisted(() => ({
  grants: undefined as unknown[] | undefined,
  pending: false,
  error: false,
  revoke: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: string, params?: { name?: string }) => (params?.name ? `${key}:${params.name}` : key),
  }),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{`at ${date}`}</span>,
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));
vi.mock('../../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    permissionLabel: (permission: { key: string; label?: string }) => permission.label ?? `label ${permission.key}`,
  }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useListMcpOAuthGrants: () => ({
    data: state.grants,
    isPending: state.pending,
    isError: state.error,
    refetch: state.refetch,
  }),
  useRevokeMcpOAuthGrant: () => ({ mutateAsync: state.revoke, isPending: false }),
  useListPermissions: () => ({ data: [{ key: 'plugin.thing', pluginName: 'demo', label: 'Demo thing' }] }),
}));

const grant = (overrides: Record<string, unknown>) => ({
  id: 'g1',
  clientName: 'Claude Code',
  registeredByOperator: false,
  permissionKeys: ['resources.read', 'users.roles.manage'],
  createdAt: '2026-01-01T10:00:00Z',
  lastUsedAt: '2026-01-02T10:00:00Z',
  expiresAt: '2026-01-08T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.grants = [
    grant({}),
    grant({ id: 'g2', clientName: 'Operator app', registeredByOperator: true, lastUsedAt: null }),
  ];
  state.pending = false;
  state.error = false;
  state.revoke.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('lists the connected apps with permissions and dates, marking self-registered ones unverified', () => {
  render(<McpGrantsCard oauthEnabled />);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  const first = within(rows[0]);
  expect(first.getByText('Claude Code')).toBeTruthy();
  expect(first.getByText('grants.unverified')).toBeTruthy();
  expect(first.getByText('label resources.read, label users.roles.manage')).toBeTruthy();
  expect(first.getByText('at 2026-01-01T10:00:00Z')).toBeTruthy();
  expect(first.getByText('at 2026-01-02T10:00:00Z')).toBeTruthy();
  expect(first.getByText('at 2026-01-08T10:00:00Z')).toBeTruthy();
  const second = within(rows[1]);
  expect(second.queryByText('grants.unverified')).toBeNull();
  expect(second.getByText('grants.neverUsed')).toBeTruthy();
});

it('collapses a long permission list to the first few labels, keeping the full list as a tooltip', async () => {
  const keys = ['a.one', 'b.two', 'c.three', 'd.four', 'plugin.thing'];
  state.grants = [grant({ permissionKeys: keys })];
  render(<McpGrantsCard oauthEnabled />);
  const cell = within(screen.getAllByRole('row')[1]);
  expect(cell.getByText('label a.one, label b.two, label c.three')).toBeTruthy();
  expect(cell.queryByText(/label d\.four/)).toBeNull();
  const more = cell.getByText('grants.morePermissions');
  await userEvent.hover(more);
  // Plugin permissions are named from the catalog.
  expect(
    await screen.findByText('label a.one, label b.two, label c.three, label d.four, Demo thing', undefined, {
      timeout: 3000,
    }),
  ).toBeTruthy();
});

it('shows an empty state when OAuth is enabled and nothing is connected', () => {
  state.grants = [];
  render(<McpGrantsCard oauthEnabled />);
  expect(screen.getByText('grants.empty')).toBeTruthy();
});

it('stays hidden without OAuth unless grants remain', () => {
  state.grants = [];
  const { container } = render(<McpGrantsCard oauthEnabled={false} />);
  expect(container.querySelector('[data-cy="mcp-grants-card"]')).toBeNull();
  cleanup();
  state.grants = [grant({})];
  render(<McpGrantsCard oauthEnabled={false} />);
  expect(screen.getByText('Claude Code')).toBeTruthy();
});

const revoke = async (name: string) => {
  render(<McpGrantsCard oauthEnabled />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  await user.click(screen.getByRole('menuitem', { name: 'grants.actions.revoke' }));
  const dialog = await screen.findByRole('alertdialog', { name: `grants.revokeConfirm.title:${name}` });
  return { user, dialog };
};

it('revokes a grant only after the user confirms', async () => {
  const { user, dialog } = await revoke('Claude Code');
  expect(state.revoke).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'grants.actions.revoke' }));
  await waitFor(() => expect(state.revoke).toHaveBeenCalledWith({ path: { grantId: 'g1' } }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'grants.success.revoked', type: 'success' }));
  expect(state.refetch).toHaveBeenCalled();
});

it('reports a failed revoke and keeps the list as it is', async () => {
  state.revoke.mockRejectedValue(new Error('down'));
  const { user, dialog } = await revoke('Claude Code');
  await user.click(within(dialog).getByRole('button', { name: 'grants.actions.revoke' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'grants.errors.revokeFailed', type: 'error' }));
  expect(state.refetch).not.toHaveBeenCalled();
});

it('reports a list that cannot be loaded', async () => {
  state.error = true;
  render(<McpGrantsCard oauthEnabled />);
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'grants.errors.loadFailed', type: 'error' }));
});

it('ships matching English and German strings', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );
  expect(keys(de).sort()).toEqual(keys(en).sort());
});
