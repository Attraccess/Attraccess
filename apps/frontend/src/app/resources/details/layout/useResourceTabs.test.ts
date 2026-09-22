import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useResourceTabs } from './useResourceTabs';
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  user: { id: 1 } as { id: number } | undefined,
  introducer: false,
  maintenance: false,
  query: vi.fn(),
}));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAccessControlServiceResourceIntroducersIsIntroducer: (...args: unknown[]) => {
    state.query(...args);
    return { data: { isIntroducer: state.introducer } };
  },
  useResourceMaintenancesServiceCanManageMaintenance: () => ({ data: { canManage: state.maintenance } }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [];
  state.user = { id: 1 };
  state.introducer = false;
  state.maintenance = false;
});
afterEach(cleanup);
it.each([
  { permissions: [], introducer: false, maintenance: false, expected: ['overview', 'history'] },
  { permissions: [], introducer: true, maintenance: false, expected: ['overview', 'history', 'people'] },
  {
    permissions: ['resources.access.manage'],
    introducer: false,
    maintenance: false,
    expected: ['overview', 'history', 'people'],
  },
  { permissions: [], introducer: false, maintenance: true, expected: ['overview', 'history', 'maintenance'] },
  {
    permissions: ['resources.update'],
    introducer: false,
    maintenance: true,
    expected: ['overview', 'history', 'people', 'groups', 'maintenance', 'flows', 'forms', 'diagnostics'],
  },
])(
  'exposes exactly the tabs allowed by $permissions, introducer=$introducer, maintenance=$maintenance',
  ({ permissions, introducer, maintenance, expected }) => {
    state.permissions = permissions;
    state.introducer = introducer;
    state.maintenance = maintenance;
    const { result } = renderHook(() => useResourceTabs(7));
    expect(result.current.tabs.map((tab) => tab.key)).toEqual(expected);
    expect(state.query).toHaveBeenCalledWith({ resourceId: 7, userId: 1, includeGroups: true }, undefined, {
      enabled: true,
    });
    expect(result.current.canUpdateResources).toBe(permissions.includes('resources.update'));
  },
);
it('disables the introducer query when the viewer is not authenticated', () => {
  state.user = undefined;
  renderHook(() => useResourceTabs(7));
  expect(state.query).toHaveBeenCalledWith({ resourceId: 7, userId: undefined, includeGroups: true }, undefined, {
    enabled: false,
  });
});
