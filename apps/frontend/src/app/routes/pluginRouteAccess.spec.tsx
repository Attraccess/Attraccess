import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RouteConfig } from '@attraccess/plugins-frontend-sdk';
import { Providers } from '@attraccess/ui';

vi.mock('../changelog/ChangelogPage', () => ({ default: () => <div>changelog</div> }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: [] } }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 0 } }),
}));

const { useAuth } = await import('../../hooks/useAuth');
const { useRoutesWithAuthElements } = await import('../app');

// A plugin route gated on keys the plugin declared, any one of which opens it.
const pluginRoute: RouteConfig = {
  path: '/matter',
  authRequired: ['matter.devices.read', 'thread.network.read'],
  element: <div>matter page</div>,
};

function Harness() {
  return <Routes>{useRoutesWithAuthElements([pluginRoute])}</Routes>;
}

function renderAs(granted: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, username: 'operator' },
    isAuthenticated: true,
    hasPermission: (permission: string) => granted.includes(permission),
    hasPermissionKey: (permission: string) => granted.includes(permission),
  } as unknown as ReturnType<typeof useAuth>);
  return render(
    <Providers>
      <MemoryRouter initialEntries={['/matter']}>
        <Harness />
      </MemoryRouter>
    </Providers>,
  );
}

describe('plugin route gate', () => {
  it('opens a plugin route for a holder of one of its plugin keys', () => {
    renderAs(['thread.network.read']);
    expect(screen.getByText('matter page')).toBeInTheDocument();
  });

  it('blocks a plugin route without any of its plugin keys, even with broad core keys', () => {
    renderAs(['system.plugins.manage', 'system.settings.manage']);
    expect(screen.queryByText('matter page')).not.toBeInTheDocument();
  });
});
