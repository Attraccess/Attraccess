import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { McpOAuthAuthorizePage } from './index';
import { McpOAuthErrorPage } from './error';
import { mcpOAuthRoutes } from './routes';
import en from './en.json';
import de from './de.json';

const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  consent: { data: undefined, isError: false, error: undefined } as {
    data?: Record<string, unknown>;
    isError: boolean;
    error?: unknown;
  },
  approve: vi.fn(),
  deny: vi.fn(),
  options: {} as Record<
    string,
    { onSuccess: (value: { redirectUrl: string }) => void; onError: (error: unknown) => void }
  >,
  leave: vi.fn(),
}));

const t = (key: string, vars?: Record<string, unknown>) => [key, ...Object.values(vars ?? {})].join(':');

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t }),
  useUrlQuery: () => state.query,
}));
vi.mock('../unauthorized/unauthorized-layout/layout', () => ({
  UnauthorizedLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../hooks/useRbacCatalogTranslations', () => ({
  useRbacCatalogTranslations: () => ({
    permissionLabel: (permission: { key: string }) => `label ${permission.key}`,
    permissionDescription: (permission: { key: string }) => `about ${permission.key}`,
    permissionCategory: (category: string, permission?: { categoryLabel?: string | null }) =>
      `category ${permission?.categoryLabel ?? category}`,
  }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useGetMcpOAuthRequest: () => state.consent,
  useApproveMcpOAuthRequest: (_mutationKey: unknown, options: (typeof state.options)[string]) => {
    state.options.approve = options;
    return { mutate: state.approve };
  },
  useDenyMcpOAuthRequest: (_mutationKey: unknown, options: (typeof state.options)[string]) => {
    state.options.deny = options;
    return { mutate: state.deny };
  },
}));
const view = {
  clientName: 'Claude Code',
  redirectUri: 'http://127.0.0.1:8123/cb',
  redirectHost: '127.0.0.1:8123',
  loopbackRedirect: true,
  registeredByOperator: false,
  // Users first: the page orders categories like the rest of the app, not like the API.
  permissions: [
    { key: 'users.roles.manage', label: 'Roles', description: 'Manage roles', category: 'users' },
    { key: 'resources.read', label: 'Read', description: 'Read resources', category: 'resources' },
    { key: 'plugin.thing', label: 'Plugin thing', description: '', category: '' },
  ],
  requestedAll: false,
  unavailablePermissions: [] as string[],
  resource: 'http://localhost:3000/api/mcp',
  expiresAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { value: { assign: state.leave }, writable: true });
  state.query = new URLSearchParams('request=mcp_rq_abc');
  state.consent = { data: view, isError: false };
});
afterEach(cleanup);

it('shows the client, the redirect host and the permissions grouped by category in the app order', () => {
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('title:Claude Code')).toBeTruthy();
  expect(screen.getByText(/^loopback.message:127.0.0.1:8123/)).toBeTruthy();
  const groups = screen.getAllByText(/^category |^permissions.other$/);
  expect(groups.map((node) => node.textContent)).toEqual(['category resources', 'category users', 'permissions.other']);
  expect(screen.getByText('label resources.read')).toBeTruthy();
  expect(screen.getByTitle('about users.roles.manage')).toBeTruthy();
});

it('lists plugin categories after the core ones under their plugin heading', () => {
  const matter = {
    key: 'matter.devices.read',
    label: 'View Matter devices',
    description: '',
    category: 'plugin:matter',
    pluginName: 'matter',
    categoryLabel: 'Matter & Thread',
  };
  state.consent = { data: { ...view, permissions: [matter, ...view.permissions] }, isError: false };
  render(<McpOAuthAuthorizePage />);
  const groups = screen.getAllByText(/^category |^permissions.other$/);
  expect(groups.map((node) => node.textContent)).toEqual([
    'category resources',
    'category users',
    'category Matter & Thread',
    'permissions.other',
  ]);
  expect(screen.queryByText('category plugin:matter')).toBeNull();
});

it('warns about a self-registered client and only notes an operator-registered one', () => {
  const external = { ...view, loopbackRedirect: false, redirectHost: 'client.example' };
  state.consent = { data: external, isError: false };
  const first = render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('external.message:client.example selfRegistered')).toBeTruthy();
  expect(first.container.querySelector('[data-cy="mcp-oauth-redirect-notice"]')?.outerHTML).toMatch(/warning/);
  first.unmount();

  state.consent = { data: { ...external, registeredByOperator: true }, isError: false };
  const second = render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('external.message:client.example')).toBeTruthy();
  expect(second.container.querySelector('[data-cy="mcp-oauth-redirect-notice"]')?.outerHTML).not.toMatch(/warning/);
});

it('explains an all-permissions request and permissions the user does not hold', () => {
  state.consent = {
    data: { ...view, requestedAll: true, unavailablePermissions: ['users.roles.manage'] },
    isError: false,
  };
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('permissions.all:3')).toBeTruthy();
  expect(screen.getByText('unavailable.message:label users.roles.manage')).toBeTruthy();
});

it('approves and sends the browser to the client', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('approve'));
  expect(state.approve).toHaveBeenCalledWith({ path: { requestId: 'mcp_rq_abc' } });
  expect(state.deny).not.toHaveBeenCalled();
  expect((screen.getByText('deny').closest('button') as HTMLButtonElement).disabled).toBe(true);
  act(() => state.options.approve.onSuccess({ redirectUrl: 'http://127.0.0.1:8123/cb?code=c&state=s' }));
  expect(state.leave).toHaveBeenCalledWith('http://127.0.0.1:8123/cb?code=c&state=s');
  expect(screen.getByText('returningApproved')).toBeTruthy();
});

it('denies and sends the browser to the client with the error redirect', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('deny'));
  expect(state.deny).toHaveBeenCalledWith({ path: { requestId: 'mcp_rq_abc' } });
  act(() => state.options.deny.onSuccess({ redirectUrl: 'http://127.0.0.1:8123/cb?error=access_denied' }));
  expect(state.leave).toHaveBeenCalledWith('http://127.0.0.1:8123/cb?error=access_denied');
  expect(screen.getByText('returningDenied')).toBeTruthy();
});

it('answers only once even when pressed twice', () => {
  render(<McpOAuthAuthorizePage />);
  const approve = screen.getByText('approve');
  fireEvent.click(approve);
  fireEvent.click(approve);
  expect(state.approve).toHaveBeenCalledTimes(1);
});

it('reports a request that is missing, expired or failed', () => {
  state.query = new URLSearchParams();
  const { unmount } = render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.missing')).toBeTruthy();
  unmount();

  state.query = new URLSearchParams('request=mcp_rq_abc');
  state.consent = { data: undefined, isError: true, error: { status: 404 } };
  const expired = render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.expired')).toBeTruthy();
  expired.unmount();

  state.consent = { data: undefined, isError: true, error: { status: 500 } };
  const generic = render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.generic')).toBeTruthy();
  generic.unmount();

  state.consent = { data: undefined, isError: true, error: { status: 404, body: { error: 'oauth_disabled' } } };
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.disabled')).toBeTruthy();
});

it('refuses to show the consent inside a frame', () => {
  const top = vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.framed')).toBeTruthy();
  expect(screen.queryByText('approve')).toBeNull();
  top.mockRestore();
});

it('explains an authorization request that cannot go back to the client, showing only known error codes', () => {
  state.query = new URLSearchParams('error=invalid_client');
  const known = render(<McpOAuthErrorPage />);
  expect(screen.getByText('authorizeError.invalid_client')).toBeTruthy();
  known.unmount();

  state.query = new URLSearchParams('error=invalid_target');
  const request = render(<McpOAuthErrorPage />);
  expect(screen.getByText('authorizeError.request:invalid_target')).toBeTruthy();
  request.unmount();

  state.query = new URLSearchParams('error=Your+account+is+locked');
  render(<McpOAuthErrorPage />);
  expect(screen.getByText('authorizeError.request:invalid_request')).toBeTruthy();
});

it('needs a sign-in for the consent page only', () => {
  expect(mcpOAuthRoutes.map(({ path, authRequired }) => [path, authRequired])).toEqual([
    ['/oauth/authorize', true],
    ['/oauth/error', false],
  ]);
});

it('sends the user to the app when the error dialog is closed and the browser keeps the window open', () => {
  const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  state.consent = { data: undefined, isError: true, error: { status: 404 } };
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('error.close'));
  expect(close).toHaveBeenCalled();
  expect(state.leave).toHaveBeenCalledWith('/');
  close.mockRestore();
});

it('ships matching English and German strings', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );
  expect(keys(de).sort()).toEqual(keys(en).sort());
});
