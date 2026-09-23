import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceTabsLayout } from './ResourceTabsLayout';
import { createMockResource } from '../../../../test-utils/fixtures';
import type { ResourceQrCode } from '../qrcode';
const state = vi.hoisted(() => ({
  update: true,
  resource: undefined as unknown,
  loading: false,
  error: undefined as Error | undefined,
  remove: vi.fn(),
  success: vi.fn(),
  showError: vi.fn(),
  invalidate: vi.fn(),
  qr: vi.fn(),
}));
vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1 },
    hasPermission: (permission: string) => state.update && permission === 'resources.update',
  }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.showError }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource, isLoading: state.loading, error: state.error }),
  useResourcesServiceDeleteOneResource: () => ({ mutateAsync: state.remove }),
  useResourcesServiceGetAllResourcesKey: 'resources',
  useAccessControlServiceResourceIntroducersIsIntroducer: () => ({ data: { isIntroducer: false } }),
  useResourceMaintenancesServiceCanManageMaintenance: () => ({ data: { canManage: state.update } }),
}));
vi.mock('../useQrCodeAction', () => ({ useQrCodeAction: vi.fn() }));
vi.mock('../health-state', () => ({ ResourceHealthWarning: () => null }));
vi.mock('../qrcode', () => ({
  ResourceQrCode: ({ renderTrigger }: ComponentProps<typeof ResourceQrCode>) => renderTrigger?.(state.qr),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.update = true;
  state.resource = createMockResource({ id: 7, name: 'Printer' });
  state.loading = false;
  state.error = undefined;
  state.remove.mockResolvedValue(undefined);
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);
function Location() {
  return <output>{useLocation().pathname}</output>;
}
function mount(path = '/resources/7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/resources/:id/settings" element={<p>Resource settings</p>} />
        <Route path="/resources/:id/*" element={<ResourceTabsLayout />}>
          <Route path="*" element={<p>Resource content</p>} />
        </Route>
        <Route path="/resources" element={<p>Resource list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function action(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
}
it('keeps nested tabs selected and supports tab and compact-picker navigation', async () => {
  mount('/resources/7/history/11');
  expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Resource content')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'History' }));
  expect(screen.getByRole('status')).toHaveTextContent('/resources/7/history');
  fireEvent.click(screen.getByRole('button', { name: /History/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Overview' }));
  expect(screen.getByRole('status')).toHaveTextContent('/resources/7');
  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
});
it('navigates to settings, opens QR actions and confirms resource deletion with cache refresh', async () => {
  const view = mount();
  await action('Settings');
  expect(screen.getByRole('status')).toHaveTextContent('/resources/7/settings');
  view.unmount();
  mount();
  await action('QR Code');
  expect(state.qr).toHaveBeenCalledOnce();
  await action('Delete');
  expect(state.remove).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(state.remove).toHaveBeenCalledWith({ id: 7 }));
  expect(await screen.findByText('Resource list')).toBeTruthy();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
  expect(state.success).toHaveBeenCalledWith({
    title: 'Resource deleted',
    description: 'Printer has been successfully deleted',
  });
});
it('limits ordinary viewers to overview and history and hides management actions', () => {
  state.update = false;
  state.resource = createMockResource({ id: 7, name: 'Printer', imageFilename: null });
  mount();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'History']);
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
});
it('redirects invalid ids and offers recovery from missing resources', () => {
  let view = mount('/resources/invalid');
  expect(screen.getByText('Resource list')).toBeTruthy();
  view.unmount();
  state.resource = undefined;
  view = mount();
  fireEvent.click(screen.getByRole('button', { name: /Back to resources/i }));
  expect(screen.getByText('Resource list')).toBeTruthy();
  view.unmount();
  state.loading = true;
  mount();
  expect(document.querySelector('[data-cy="resource-details-loading-spinner"]')).toBeTruthy();
  expect(screen.queryByText('Resource content')).toBeNull();
});
