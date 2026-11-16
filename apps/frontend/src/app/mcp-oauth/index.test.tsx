import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { McpOAuthAuthorizePage } from './index';
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
    permissionCategory: (category: string) => `category ${category}`,
  }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListPermissions: () => ({
    data: [
      { key: 'resources.read', label: 'Read', description: '', category: 'resources' },
      { key: 'users.roles.manage', label: 'Roles', description: '', category: 'users' },
    ],
  }),
  useMcpOauthServiceGetMcpOauthRequest: () => state.consent,
  useMcpOauthServiceApproveMcpOauthRequest: (options: (typeof state.options)[string]) => {
    state.options.approve = options;
    return { mutate: state.approve };
  },
  useMcpOauthServiceDenyMcpOauthRequest: (options: (typeof state.options)[string]) => {
    state.options.deny = options;
    return { mutate: state.deny };
  },
}));
const view = {
  clientName: 'Claude Code',
  redirectUri: 'http://127.0.0.1:8123/cb',
  redirectHost: '127.0.0.1:8123',
  loopbackRedirect: true,
  permissions: ['resources.read', 'users.roles.manage'],
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

it('shows the client, the redirect host and the permissions grouped by category', () => {
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('title:Claude Code')).toBeTruthy();
  expect(screen.getByText('loopback.message:127.0.0.1:8123')).toBeTruthy();
  const groups = screen.getAllByText(/^category /);
  expect(groups.map((node) => node.textContent)).toEqual(['category resources', 'category users']);
  expect(screen.getByText('label resources.read')).toBeTruthy();
  expect(screen.getByText(/about users.roles.manage/)).toBeTruthy();
});

it('asks to confirm the address of a client that is not on this device', () => {
  state.consent = { data: { ...view, loopbackRedirect: false, redirectHost: 'client.example' }, isError: false };
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('external.message:client.example')).toBeTruthy();
});

it('explains an all-permissions request and permissions the user does not hold', () => {
  state.consent = {
    data: { ...view, requestedAll: true, unavailablePermissions: ['users.roles.manage'] },
    isError: false,
  };
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('permissions.all:2')).toBeTruthy();
  expect(screen.getByText('unavailable.message:users.roles.manage')).toBeTruthy();
});

it('approves and sends the browser to the client', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('approve'));
  expect(state.approve).toHaveBeenCalledWith({ requestId: 'mcp_rq_abc' });
  expect(state.deny).not.toHaveBeenCalled();
  expect(screen.getByText('returning')).toBeTruthy();
  state.options.approve.onSuccess({ redirectUrl: 'http://127.0.0.1:8123/cb?code=c&state=s' });
  expect(state.leave).toHaveBeenCalledWith('http://127.0.0.1:8123/cb?code=c&state=s');
});

it('denies and sends the browser to the client with the error redirect', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('deny'));
  expect(state.deny).toHaveBeenCalledWith({ requestId: 'mcp_rq_abc' });
  state.options.deny.onSuccess({ redirectUrl: 'http://127.0.0.1:8123/cb?error=access_denied' });
  expect(state.leave).toHaveBeenCalledWith('http://127.0.0.1:8123/cb?error=access_denied');
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
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('error.generic')).toBeTruthy();
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
