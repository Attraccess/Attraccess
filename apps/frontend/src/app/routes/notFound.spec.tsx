import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemPermission } from '@attraccess/shared';
import usePluginState from '../plugins/plugin.state';

// The changelog page reads CHANGELOG.md from the repo root with `?raw`, which lives outside the
// frontend's vite root and is therefore unreadable here. Nothing in this spec touches it.
vi.mock('../changelog/ChangelogPage', () => ({ default: () => <div>changelog</div> }));

// The real shell opens websockets and live-update subscriptions on mount. What matters here is only
// that the catch-all renders *inside* it — a stand-in with the same <main> proves that.
vi.mock('../layout/layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div>
      <aside data-cy="app-shell-sidebar" />
      <main>{children}</main>
    </div>
  ),
}));

vi.mock('../unauthorized/unauthorized', () => ({
  Unauthorized: () => <div data-cy="unauthorized" />,
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: [] } }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 0 } }),
  useUsersServiceGetOneUserById: () => ({ data: undefined }),
  useAuthenticationServiceGetAllSsoProviders: () => ({ data: [] }),
  useRbacServiceListRoles: () => ({ data: [] }),
  useRbacServiceListPermissions: () => ({ data: [] }),
  useUsersServiceGetUserRoleAssignments: () => ({ data: [] }),
}));

const { useAuth } = await import('../../hooks/useAuth');
const { AppRoutes } = await import('../app');

function mockOperator(granted: SystemPermission[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, username: 'operator' },
    isAuthenticated: true,
    hasPermission: (permission: SystemPermission) => granted.includes(permission),
  } as unknown as ReturnType<typeof useAuth>);
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The shell tags its elements with `data-cy`, not `data-testid`. */
function byCy(value: string) {
  return document.querySelector(`[data-cy="${value}"]`);
}

describe('not-found route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePluginState.setState({ isLoading: false, plugins: [] });
    mockOperator(['system.settings.manage', 'users.read']);
  });

  it('shows plugin loading instead of the catch-all while plugin routes are registering', () => {
    usePluginState.setState({ isLoading: true });
    renderAt('/wago');

    expect(screen.getByRole('status')).toHaveTextContent('Loading plugins');
    expect(byCy('not-found')).toBeNull();
  });

  // ATT-866 deleted twelve admin routes on a "move, don't redirect" decision. Without a catch-all
  // those paths matched nothing and the whole document — shell included — came up blank.
  it.each(['/monitoring', '/emails', '/messages/settings', '/plugins', '/sso/providers'])(
    'renders the not-found page inside the app shell for the removed %s',
    (path) => {
      renderAt(path);

      expect(byCy('not-found')).toBeInTheDocument();
      expect(document.querySelector('main')).not.toBeNull();
      expect(byCy('app-shell-sidebar')).toBeInTheDocument();
    },
  );

  // `/users/security` still matches `/users/:id`, which used to render a detail page for a user that
  // cannot exist — heading `(ID: )`, empty body. A non-numeric segment is not a user.
  it('renders not-found for /users/security rather than a user detail page', () => {
    renderAt('/users/security');

    expect(byCy('not-found')).toBeInTheDocument();
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();
  });

  it('still renders the user detail page for a numeric id', () => {
    renderAt('/users/42');

    expect(byCy('not-found')).toBeNull();
  });

  it('renders not-found for an arbitrary unknown path', () => {
    renderAt('/resourcez');

    expect(byCy('not-found')).toBeInTheDocument();
    expect(byCy('app-shell-sidebar')).toBeInTheDocument();
  });

  it('renders not-found with a login action to a logged-out visitor on an unknown path', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      hasPermission: () => false,
    } as unknown as ReturnType<typeof useAuth>);

    renderAt('/resourcez');

    expect(byCy('not-found')).toBeInTheDocument();
    expect(byCy('not-found-login-button')).toBeInTheDocument();
    expect(byCy('not-found-go-home-button')).toBeNull();
  });

  it('still renders login for a logged-out visitor on a known protected path', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      hasPermission: () => false,
    } as unknown as ReturnType<typeof useAuth>);

    renderAt('/resources');

    expect(byCy('unauthorized')).toBeInTheDocument();
    expect(byCy('not-found')).toBeNull();
  });
});
