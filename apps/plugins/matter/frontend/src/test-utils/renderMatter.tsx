// Mounts the Matter page the way the host does: one flat route per subpage under a router, with a live client.
import { PluginLiveUpdatesProvider } from '@attraccess/plugins-frontend-sdk';
import { act, render } from '@testing-library/react';
import { useEffect, type RefObject } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
} from 'react-router-dom';
import { MatterPage } from '../MatterPage';
import { MATTER_ROUTE_PATHS } from '../matterPaths';
import { setMatterAuthData } from '../permissions';
import { createFakeLiveClient } from './liveClient';

export const signIn = (...effectivePermissions: string[]) =>
  act(() => setMatterAuthData({ authToken: '', user: {} as never, effectivePermissions }));

export const ALL_KEYS = [
  'matter.devices.read',
  'matter.devices.manage',
  'matter.devices.commission',
  'matter.devices.command-direct',
  'thread.network.read',
  'thread.network.manage',
];

/** The current path, and in `data-navigation` how the router got there (PUSH, REPLACE or POP). */
function Where({ navigateRef }: Readonly<{ navigateRef: RefObject<NavigateFunction | null> }>) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate, navigateRef]);
  return (
    <output data-cy="location" data-navigation={navigationType}>
      {location.pathname}
    </output>
  );
}

/**
 * Renders the page at `path`. With `before`, the history already holds that entry below `path`, so a test can tell a
 * replace (back leaves the page) from a push (back returns to `path`). `back()` is the browser's back button.
 */
export function renderMatter(path: string, options: { before?: string } = {}) {
  const live = createFakeLiveClient();
  const navigateRef: RefObject<NavigateFunction | null> = { current: null };
  const entries = options.before ? [options.before, path] : [path];
  const view = render(
    <PluginLiveUpdatesProvider client={live.client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Where navigateRef={navigateRef} />
        <Routes>
          {MATTER_ROUTE_PATHS.map((route) => (
            <Route key={route} path={route} element={<MatterPage />} />
          ))}
        </Routes>
      </MemoryRouter>
    </PluginLiveUpdatesProvider>,
  );
  const back = () => act(() => void navigateRef.current?.(-1));
  return { ...view, live, back };
}
