import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanionSettingsPage } from './index';
const state = vi.hoisted(() => ({
  devices: [] as { id: number; name: string; appVersion?: string; lastConnection: string }[],
  details: {} as Record<number, { connected?: boolean; appVersion?: string }>,
  manifest: undefined as
    undefined | { version: string; platforms: { platform: string; arch: string; filename: string }[] },
  loading: false,
  manifestLoading: false,
  rename: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  renameOptions: {} as { onSuccess: () => void; onError: () => void },
  deleteOptions: {} as { onSuccess: () => void; onError: () => void },
}));
vi.mock('@attraccess/react-query-client', () => ({
  UseCompanionDevicesServiceListCompanionDevicesKeyFn: () => ['devices'],
  useCompanionDevicesServiceListCompanionDevices: () => ({ data: state.devices, isLoading: state.loading }),
  useCompanionServiceGetCompanionVersions: () => ({ data: state.manifest, isLoading: state.manifestLoading }),
  useCompanionDevicesServiceGetCompanionDevice: ({ id }: { id: number }) => ({ data: state.details[id] }),
  useCompanionDevicesServiceRenameCompanionDevice: (options: typeof state.renameOptions) => {
    state.renameOptions = options;
    return { mutate: state.rename };
  },
  useCompanionDevicesServiceDeleteCompanionDevice: (options: typeof state.deleteOptions) => {
    state.deleteOptions = options;
    return { mutate: state.remove };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (date: string) => date,
  I18nTransComponent: ({ values }: { values: { itemName: string } }) => <span>Delete {values.itemName}</span>,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('../../../api', () => ({ getBaseUrl: () => 'https://api.example.test' }));
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { devices: [], details: {}, manifest: undefined, loading: false, manifestLoading: false });
});
afterEach(cleanup);
function show() {
  return render(
    <MemoryRouter>
      <CompanionSettingsPage />
    </MemoryRouter>,
  );
}
it('shows an empty download state and setup instructions after loading', () => {
  state.loading = true;
  state.manifestLoading = true;
  const view = show();
  expect(screen.queryByText('download.noBinaries')).toBeNull();
  view.unmount();
  state.loading = false;
  state.manifestLoading = false;
  show();
  expect(screen.getByText('download.noBinaries')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /setup.steps.download.title/ }));
  expect(screen.getByText('setup.steps.download.description')).toBeTruthy();
});
it('labels all supported platforms and points downloads at the API endpoint', () => {
  state.manifest = {
    version: '2.0.0',
    platforms: [
      ['win32', 'x64'],
      ['darwin', 'universal'],
      ['linux', 'arm64'],
      ['linux', 'x64'],
      ['custom', 'riscv'],
    ].map(([platform, arch]) => ({ platform, arch, filename: `${platform}-${arch}.bin` })),
  };
  show();
  for (const label of ['Windows x64', 'macOS (Universal)', 'Linux arm64', 'Linux x64', 'custom riscv'])
    expect(screen.getByText(label)).toBeTruthy();
  const downloads = screen.getAllByRole('link');
  expect(downloads).toHaveLength(5);
  expect(downloads[0]).toHaveAttribute('href', 'https://api.example.test/api/companion/download/win32/x64');
  expect(downloads[0]).toHaveAttribute('download', 'win32-x64.bin');
});
it('shows live connection/version status, trims renamed devices and refreshes the list', async () => {
  state.devices = [
    { id: 1, name: 'Workshop PC', appVersion: '1.0.0', lastConnection: 'Yesterday' },
    { id: 2, name: 'Offline PC', lastConnection: 'Last week' },
  ];
  state.details = { 1: { connected: true, appVersion: '1.1.0' } };
  state.manifest = { version: '2.0.0', platforms: [] };
  show();
  expect(screen.getByText('devices.status.online')).toBeTruthy();
  expect(screen.getByText('devices.status.offline')).toBeTruthy();
  expect(screen.getByText('updateAvailable')).toBeTruthy();
  const row = screen.getByText('Workshop PC').closest('tr');
  expect(row).toBeTruthy();
  fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'devices.actions.rename' }));
  const input = await screen.findByRole('textbox', { name: 'devices.rename.label' });
  expect(input).toHaveValue('Workshop PC');
  fireEvent.change(input, { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'devices.rename.save' }));
  expect(state.rename).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '  Tool PC  ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(state.rename).toHaveBeenCalledWith({ id: 1, requestBody: { name: 'Tool PC' } });
  act(() => state.renameOptions.onError());
  expect(state.error).toHaveBeenCalledWith({ title: 'devices.rename.error' });
  act(() => state.renameOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['devices'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'devices.rename.success' });
});
it('confirms removal, reports failures and ignores invalid version strings', async () => {
  state.devices = [{ id: 3, name: 'Old PC', appVersion: 'dev', lastConnection: 'Today' }];
  state.manifest = { version: '2.0.0', platforms: [] };
  show();
  expect(screen.queryByText('updateAvailable')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'devices.actions.delete' }));
  expect(await screen.findByText('Delete Old PC')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'deleteButton' }));
  expect(state.remove).toHaveBeenCalledWith({ id: 3 });
  act(() => state.deleteOptions.onError());
  expect(state.error).toHaveBeenCalledWith({ title: 'devices.delete.error' });
  act(() => state.deleteOptions.onSuccess());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['devices'] });
  expect(state.success).toHaveBeenCalledWith({ title: 'devices.delete.success' });
});
