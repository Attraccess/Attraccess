import '@testing-library/jest-dom/vitest';
import { useMemo } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemPermission } from '@attraccess/shared';
import type { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { Providers } from '@attraccess/ui';

// The changelog page reads CHANGELOG.md from the repo root with `?raw`, which lives outside the
// frontend's vite root and is therefore unreadable here. Nothing in this spec touches it.
vi.mock('../changelog/ChangelogPage', () => ({ default: () => <div>changelog</div> }));

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: [] } }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 0 } }),
}));

const { useAuth } = await import('../../hooks/useAuth');
const { useAllRoutes } = await import('./index');
const { useRoutesWithAuthElements } = await import('../app');
const { Sidebar } = await import('../layout/sidebar');

function mockOperator(granted: SystemPermission[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, username: 'operator' },
    isAuthenticated: true,
    hasPermission: (permission: SystemPermission) => granted.includes(permission),
  } as unknown as ReturnType<typeof useAuth>);
}

function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: isDesktop,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/**
 * The real `/settings` route, run through the real router gate. Section elements are stubbed —
 * what is under test is who gets past the gate and where `/settings` sends them, not what the SSO
 * screen renders.
 */
function RouterHarness() {
  const allRoutes = useAllRoutes();

  const settingsRoutes = useMemo(
    () =>
      allRoutes
        .filter((route) => route.path === '/settings' || route.path === '/settings/sso')
        .map((route) =>
          route.path === '/settings' ? route : ({ ...route, element: <div>sso section</div> } as RouteConfig),
        ),
    [allRoutes],
  );

  return <Routes>{useRoutesWithAuthElements(settingsRoutes)}</Routes>;
}

function renderSettingsRoute() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <RouterHarness />
    </MemoryRouter>,
  );
}

/** The shell tags its elements with `data-cy`, not `data-testid`. */
function byCy(value: string) {
  return document.querySelector(`[data-cy="${value}"]`);
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/resources']}>
      <Providers>
        <Sidebar isOpen toggleSidebar={vi.fn()} isCollapsed={false} toggleCollapsed={vi.fn()} />
      </Providers>
    </MemoryRouter>,
  );
}

describe('/settings access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewport(true);
  });

  // Deleting /sso/providers made the settings shell the only way to SSO. An operator holding just
  // system.sso.manage must therefore get through /settings, or their section is unreachable.
  describe('an operator holding only system.sso.manage', () => {
    beforeEach(() => mockOperator(['system.sso.manage']));

    it('sees the Settings entry in the sidebar', () => {
      renderSidebar();

      expect(byCy('sidebar-nav-settings')).toHaveAttribute('href', '/settings');
    });

    it('is let into /settings and redirected to their section', () => {
      renderSettingsRoute();

      expect(screen.getByText('sso section')).toBeInTheDocument();
      expect(byCy('access-denied-go-home-button')).toBeNull();
    });
  });

  describe('an operator holding none of the settings permissions', () => {
    beforeEach(() => mockOperator(['resources.read']));

    it('does not see the Settings entry in the sidebar', () => {
      renderSidebar();

      expect(byCy('sidebar-nav-settings')).toBeNull();
    });

    it('is refused at /settings', () => {
      renderSettingsRoute();

      expect(byCy('access-denied-go-home-button')).toBeInTheDocument();
      expect(screen.queryByText('sso section')).not.toBeInTheDocument();
    });
  });
});
