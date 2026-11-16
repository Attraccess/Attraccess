import '@testing-library/jest-dom/vitest';
import { renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginSidebarItem } from '@attraccess/plugins-frontend-sdk';
import { PinnablePagesProvider } from './pinnablePages';
import { usePinnablePages } from './pinnablePagesContext';
import usePluginState, { PluginManifestWithPlugin } from '../plugins/plugin.state';

const state = vi.hoisted(() => ({
  license: { modules: [] as string[] } as { modules: string[] } | undefined,
  pluginItems: [] as PluginSidebarItem[],
  denied: new Set<string>(),
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    t: (key: string) => {
      // Sidebar keys contain "##default##", which has no dots, so a plain split works.
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
      return typeof value === 'string' ? value : key;
    },
  }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useLicenseServiceGetLicenseInformation: () => ({ data: state.license }),
  useMessagingServiceMessagingGetUnreadCount: () => ({ data: { total: 4 } }),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../layout/sidebar/useShowNavItem', () => ({
  useShowNavItem: () => (item: { path: string }) => !state.denied.has(item.path),
}));
vi.mock('../layout/sidebar/usePluginSidebarContributions', () => ({
  usePluginSidebarContributions: () => ({ pluginNavItems: state.pluginItems, pluginNavGroups: [] }),
}));

const wrapper = ({ children }: PropsWithChildren) => <PinnablePagesProvider>{children}</PinnablePagesProvider>;
const render = () => renderHook(() => usePinnablePages(), { wrapper }).result.current;
const paths = () => render().pages.map((page) => page.path);

function installPlugin(dashboardPaths?: string[]) {
  usePluginState.setState({
    plugins: [{ name: 'report', main: { frontend: { dashboardPaths } } } as unknown as PluginManifestWithPlugin],
  });
}

beforeEach(() => {
  state.license = { modules: [] };
  state.pluginItems = [];
  state.denied = new Set();
  usePluginState.setState({ plugins: [], isInitialized: true });
});

describe('PinnablePagesProvider', () => {
  it('offers the permitted internal sidebar pages, never the dashboard or external links', () => {
    state.denied.add('/users');

    expect(paths()).toEqual(
      expect.arrayContaining(['/resources', '/projects', '/messages', '/dependencies', '/printables']),
    );
    expect(paths()).not.toContain('/dashboard');
    expect(paths()).not.toContain('/users');
    expect(paths().every((path) => path.startsWith('/'))).toBe(true);
  });

  it('leaves out pages of modules the license does not include', () => {
    expect(paths()).not.toContain('/billing');
    state.license = { modules: ['billing'] };
    expect(paths()).toContain('/billing');
  });

  it('carries the sidebar title, icon and unread badge', () => {
    const messages = render().pages.find((page) => page.path === '/messages');
    expect(messages).toMatchObject({ title: 'Messages', badgeCount: 4 });
    expect(messages?.icon).toBeTruthy();
  });

  it('sorts pages into the gallery groups of their feature, else "Other pages", and plugin pages into their plugin', () => {
    state.license = { modules: ['attractap', 'billing'] };
    state.pluginItems = [{ path: '/plugin-report', label: 'Reports' }];
    installPlugin(['/plugin-report']);
    const groupOf = (path: string) => render().pages.find((page) => page.path === path)?.galleryGroup;

    expect(groupOf('/messages')).toBe('messages');
    expect(groupOf('/projects')).toBe('resources');
    expect(groupOf('/billing')).toBe('billing');
    expect(groupOf('/attractap/readers')).toBe('attractap');
    expect(groupOf('/settings')).toBe('other');
    expect(groupOf('/plugin-report')).toBe('plugin:report');
  });

  it('offers a plugin page only when its plugin lists it in dashboardPaths', () => {
    state.pluginItems = [
      { path: '/plugin-report', label: 'Reports' },
      { path: '/plugin-other', label: 'Other' },
    ];
    installPlugin(['/plugin-report']);

    expect(paths()).toContain('/plugin-report');
    expect(paths()).not.toContain('/plugin-other');
    installPlugin(undefined);
    expect(paths()).not.toContain('/plugin-report');
  });

  it('names pages the user may no longer open', () => {
    state.denied.add('/users');
    expect(render().titleOf('/users')).toBe('Users');
    expect(render().titleOf('/unknown')).toBeUndefined();
  });

  it('is ready only once the license and the plugins have loaded', () => {
    expect(render().isReady).toBe(true);
    usePluginState.setState({ isInitialized: false });
    expect(render().isReady).toBe(false);
    usePluginState.setState({ isInitialized: true });
    state.license = undefined;
    expect(render().isReady).toBe(false);
  });
});
