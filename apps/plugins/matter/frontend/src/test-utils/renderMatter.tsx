// Mounts the Matter page the way the host does: one flat route per subpage under a router, with a live client.
import { PluginLiveUpdatesProvider } from '@attraccess/plugins-frontend-sdk';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

function Where() {
  const location = useLocation();
  return <output data-cy="location">{location.pathname}</output>;
}

export function renderMatter(path: string) {
  const live = createFakeLiveClient();
  const view = render(
    <PluginLiveUpdatesProvider client={live.client}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          {MATTER_ROUTE_PATHS.map((route) => (
            <Route key={route} path={route} element={<MatterPage />} />
          ))}
        </Routes>
      </MemoryRouter>
    </PluginLiveUpdatesProvider>,
  );
  return { ...view, live };
}
