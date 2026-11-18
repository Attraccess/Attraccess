import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanOpenPage } from './access';

const state = vi.hoisted(() => ({
  license: { modules: [] as string[] } as { modules: string[] } | undefined,
  denied: new Set<string>(),
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetLicenseInformation: () => ({ data: state.license }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../../layout/sidebar/useShowNavItem', () => ({
  useShowNavItem: () => (item: { path: string }) => !state.denied.has(item.path),
}));

const canOpen = (path: string) => renderHook(() => useCanOpenPage()).result.current(path);

beforeEach(() => {
  state.license = { modules: [] };
  state.denied = new Set();
});

describe('useCanOpenPage', () => {
  it.each([
    ['/billing', 'billing'],
    ['/attractap/readers', 'attractap'],
  ])('needs the license module of %s', (path, module) => {
    expect(canOpen(path)).toBe(false);
    state.license = { modules: [module] };
    expect(canOpen(path)).toBe(true);
  });

  it('needs the route permission the sidebar checks', () => {
    state.denied.add('/users');
    expect(canOpen('/users')).toBe(false);
    expect(canOpen('/messages')).toBe(true);
  });

  it('refuses licensed pages until the license has loaded', () => {
    state.license = undefined;
    expect(canOpen('/billing')).toBe(false);
    expect(canOpen('/resources')).toBe(true);
  });
});
