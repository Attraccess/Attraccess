import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapDiagnostics } from './AttractapDiagnostics';
const state = vi.hoisted(() => ({
  reports: [] as unknown[],
  loading: false,
  error: false,
  toast: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: state.toast }) }));
vi.mock('@attraccess/react-query-client', () => ({
  OpenAPI: { BASE: 'https://api.test' },
  useAttractapServiceGetReaderCrashReports: (...args: unknown[]) => {
    state.query(...args);
    return { data: state.reports, isLoading: state.loading, isError: state.error };
  },
}));
const report = {
  id: 9,
  createdAt: '2026-09-22T10:00:00Z',
  heapFreeBytes: 2048,
  largestFreeBlockBytes: 512,
  uptimeBeforeResetMs: 3661000,
  resetReason: 'Watchdog',
  rebootReason: 'Stalled task',
  symbolicationStatus: 'success',
  firmwareMatchesLatestServer: false,
  firmwareMatchesCurrentReader: false,
  firmwareVersion: '1.0',
  currentReaderFirmwareVersion: '1.1',
  latestServerFirmwareVersion: '1.2',
  wsState: 'connected',
  wifiState: 'online',
  coredumpBuildId: 'build-fixture',
  coredumpBuildIdKnown: false,
  symbolizedBacktrace: 'fixture_task at main.cpp:42',
  coredumpSize: 4096,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.reports = [];
  state.loading = false;
  state.error = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('distinguishes loading, errors, and a reader without reports', () => {
  state.loading = true;
  const view = render(<AttractapDiagnostics readerId={7} />);
  expect(screen.getByText('loading')).toBeTruthy();
  state.loading = false;
  state.error = true;
  view.rerender(<AttractapDiagnostics readerId={7} />);
  expect(screen.getByText('error')).toBeTruthy();
  state.error = false;
  view.rerender(<AttractapDiagnostics />);
  expect(screen.getByText('empty')).toBeTruthy();
  expect(state.query).toHaveBeenLastCalledWith({ readerId: undefined }, undefined, { enabled: false });
});
it('renders firmware mismatches, formatted telemetry, heap trend, and expandable backtraces', () => {
  state.reports = [
    report,
    { id: 8, createdAt: report.createdAt, resetReason: 'Power on', symbolicationStatus: 'unavailable' },
  ];
  const { container } = render(<AttractapDiagnostics readerId={7} />);
  expect(screen.getByText('firmwareMismatch')).toBeTruthy();
  expect(screen.getByText('fields.heapFree: 2.0 KB')).toBeTruthy();
  expect(screen.getByText('fields.largestBlock: 512 B')).toBeTruthy();
  expect(screen.getByText('fields.uptime: 1h 1m 1s')).toBeTruthy();
  expect(screen.getByText('buildIdMissing')).toBeTruthy();
  expect(screen.getByText('symbolicationUnavailableHint')).toBeTruthy();
  expect(container.querySelector('[data-cy="attractap-diagnostics-heap-trend"]')?.children).toHaveLength(2);
  expect(screen.queryByText(report.symbolizedBacktrace)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'showBacktrace' }));
  expect(screen.getByText(report.symbolizedBacktrace)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'hideBacktrace' }));
  expect(screen.queryByText(report.symbolizedBacktrace)).toBeNull();
});
it('downloads an authenticated binary coredump and releases the temporary URL', async () => {
  state.reports = [report];
  const blob = new Blob(['fixture']);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  vi.stubGlobal('fetch', fetcher);
  const createObjectURL = vi.fn().mockReturnValue('blob:fixture');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('reader-7-crash-9.coredump');
  });
  render(<AttractapDiagnostics readerId={7} />);
  fireEvent.click(screen.getByRole('button', { name: /downloadCoredump/ }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith('https://api.test/api/attractap/readers/7/crash-reports/9/coredump', {
    credentials: 'include',
  });
  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
  expect(document.querySelector('a[download]')).toBeNull();
});
it('reports download failures without claiming success', async () => {
  state.reports = [report];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  render(<AttractapDiagnostics readerId={7} />);
  fireEvent.click(screen.getByRole('button', { name: /downloadCoredump/ }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'downloadFailed', description: 'HTTP 503' }));
});
