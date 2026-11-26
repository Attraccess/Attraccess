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
// The picker has its own tests; here it is a list of checkboxes with the same props.
vi.mock('../../components/permissionPicker', () => ({
  PermissionPicker: (props: {
    permissions: Array<{ key: string }>;
    selectedKeys: Set<string>;
    onChange: (keys: Iterable<string>) => void;
    presentation?: string;
    isDisabled?: boolean;
  }) => (
    <fieldset data-presentation={props.presentation} disabled={props.isDisabled}>
      {props.permissions.map(({ key }) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={props.selectedKeys.has(key)}
            onChange={() => {
              const next = new Set(props.selectedKeys);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              props.onChange(next);
            }}
          />
          {`pick ${key}`}
        </label>
      ))}
    </fieldset>
  ),
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
const permission = (key: string, category: string) => ({ key, label: key, description: '', category });
const view = {
  clientName: 'Claude Code',
  redirectUri: 'http://127.0.0.1:8123/cb',
  redirectHost: '127.0.0.1:8123',
  loopbackRedirect: true,
  registeredByOperator: false,
  permissions: [permission('users.roles.manage', 'users'), permission('resources.read', 'resources')],
  requestedAll: false,
  unavailablePermissions: [] as string[],
  resource: 'http://localhost:3000/api/mcp',
  availablePermissions: [
    permission('resources.read', 'resources'),
    permission('resources.update', 'resources'),
    permission('users.roles.manage', 'users'),
  ],
  requestedPermissionKeys: ['users.roles.manage', 'resources.read'],
  tools: [
    { name: 'listRoles', summary: 'List roles', requiredAll: ['users.roles.manage'], requiredAny: [] },
    { name: 'getAllResources', summary: 'List resources', requiredAll: [], requiredAny: [] },
    { name: 'updateResource', summary: 'Update', requiredAll: ['resources.update'], requiredAny: [] },
    { name: 'readOrUpdate', summary: 'Either', requiredAll: [], requiredAny: ['resources.read', 'resources.update'] },
  ],
  expiresAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { value: { assign: state.leave }, writable: true });
  state.query = new URLSearchParams('request=mcp_rq_abc');
  state.consent = { data: view, isError: false };
});
afterEach(cleanup);

const selected = () =>
  screen
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.parentElement?.textContent);
const toolCount = () => screen.getByText(/^tools\.title:/).textContent;
const approveButton = () => screen.getByText('approve').closest('button') as HTMLButtonElement;

it('shows the client and the redirect host', () => {
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('title:Claude Code')).toBeTruthy();
  expect(screen.getByText(/^loopback.message:127.0.0.1:8123/)).toBeTruthy();
});

it('offers the permissions the user holds in the drawer picker, preselected with the requested ones', () => {
  const { container } = render(<McpOAuthAuthorizePage />);
  expect(container.querySelector('[data-presentation="drawer"]')).toBeTruthy();
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  expect(selected()).toEqual(['pick resources.read', 'pick users.roles.manage']);
});

it('preselects everything the user holds when the client asked for all', () => {
  state.consent = {
    data: { ...view, requestedAll: true, requestedPermissionKeys: view.availablePermissions.map(({ key }) => key) },
    isError: false,
  };
  render(<McpOAuthAuthorizePage />);
  expect(selected()).toHaveLength(3);
  expect(screen.getByText('permissions.all:3')).toBeTruthy();
});

it('preselects only requested permissions the user holds', () => {
  state.consent = {
    data: {
      ...view,
      requestedPermissionKeys: ['resources.read', 'billing.manage'],
      unavailablePermissions: ['billing.manage'],
    },
    isError: false,
  };
  render(<McpOAuthAuthorizePage />);
  expect(selected()).toEqual(['pick resources.read']);
});

it('counts the tools the current selection enables and updates when it changes', () => {
  render(<McpOAuthAuthorizePage />);
  // listRoles, getAllResources (open to everyone) and readOrUpdate (needs one of two).
  expect(toolCount()).toBe('tools.title:3');
  fireEvent.click(screen.getByLabelText('pick users.roles.manage'));
  expect(toolCount()).toBe('tools.title:2');
  fireEvent.click(screen.getByLabelText('pick resources.update'));
  expect(toolCount()).toBe('tools.title:3');
  fireEvent.click(screen.getByLabelText('pick resources.read'));
  fireEvent.click(screen.getByLabelText('pick resources.update'));
  // Nothing selected: nothing can be allowed, so even the tools that need no permission do not count.
  expect(toolCount()).toBe('tools.title:0');
});

it('lists the names and summaries of the enabled tools', () => {
  const { container } = render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText(/^tools\.title:/));
  const list = container.querySelector('[data-cy="mcp-oauth-tools-list"]');
  expect(list?.textContent).toContain('listRoles');
  expect(list?.textContent).toContain('List roles');
  expect(list?.textContent).not.toContain('updateResource');
});

it('disables Allow when nothing is selected', () => {
  render(<McpOAuthAuthorizePage />);
  expect(approveButton().disabled).toBe(false);
  fireEvent.click(screen.getByLabelText('pick resources.read'));
  fireEvent.click(screen.getByLabelText('pick users.roles.manage'));
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(approveButton());
  expect(state.approve).not.toHaveBeenCalled();
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

it('explains permissions the user does not hold', () => {
  state.consent = {
    data: { ...view, unavailablePermissions: ['users.roles.manage'] },
    isError: false,
  };
  render(<McpOAuthAuthorizePage />);
  expect(screen.getByText('unavailable.message:label users.roles.manage')).toBeTruthy();
});

it('approves with the selected permissions and sends the browser to the client', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByLabelText('pick resources.update'));
  fireEvent.click(screen.getByLabelText('pick resources.read'));
  fireEvent.click(screen.getByText('approve'));
  expect(state.approve).toHaveBeenCalledWith({
    path: { requestId: 'mcp_rq_abc' },
    body: { permissionKeys: ['resources.update', 'users.roles.manage'] },
  });
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

it('lets the user correct the selection after the API rejects it, instead of ending the flow', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('approve'));
  act(() => state.options.approve.onError({ status: 400 }));
  expect(screen.getByText('selectionError')).toBeTruthy();
  expect(screen.queryByText('error.expired')).toBeNull();
  expect(screen.queryByText('error.generic')).toBeNull();
  expect(approveButton().disabled).toBe(false);
  fireEvent.click(screen.getByLabelText('pick resources.read'));
  expect(screen.queryByText('selectionError')).toBeNull();
  fireEvent.click(approveButton());
  expect(state.approve).toHaveBeenCalledTimes(2);
});

it('still ends the flow when the request has expired while approving', () => {
  render(<McpOAuthAuthorizePage />);
  fireEvent.click(screen.getByText('approve'));
  act(() => state.options.approve.onError({ status: 404 }));
  expect(screen.getByText('error.expired')).toBeTruthy();
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
