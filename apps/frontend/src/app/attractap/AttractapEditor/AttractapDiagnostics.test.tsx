import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AttractapDiagnostics } from './diagnostics/index';
import { hasPendingCoredump, PENDING_COREDUMP_POLL_WINDOW_MS } from './diagnostics/useDiagnostics';
const state = vi.hoisted(() => ({
  reports: [] as unknown[],
  loading: false,
  error: false,
  toast: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
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
  createdAt: '2026-09-22T10:00:37Z',
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
  expect(state.query).toHaveBeenLastCalledWith(
    { readerId: undefined },
    undefined,
    expect.objectContaining({ enabled: false }),
  );
});
it('renders firmware mismatches, formatted telemetry, heap trend, and expandable backtraces', () => {
  state.reports = [
    report,
    { id: 8, createdAt: report.createdAt, resetReason: 'Power on', symbolicationStatus: 'unavailable' },
  ];
  const { container } = render(<AttractapDiagnostics readerId={7} />);
  expect(
    screen.getAllByText(
      new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(report.createdAt)),
    ).length,
  ).toBeGreaterThan(0);
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
it('tells a coredump that is still being uploaded and a recovered one apart from reports without a dump', () => {
  state.reports = [
    {
      id: 11,
      createdAt: report.createdAt,
      resetReason: 'PANIC',
      coredumpStatus: 'awaiting',
      coredumpExpectedSize: 43776,
      coredumpSize: null,
    },
    {
      id: 12,
      createdAt: report.createdAt,
      resetReason: 'UNKNOWN',
      rebootReason: 'COREDUMP_ORPHAN',
      coredumpSize: 4096,
    },
    { id: 13, createdAt: report.createdAt, resetReason: 'POWERON', coredumpStatus: null, coredumpSize: null },
  ];
  const { container } = render(<AttractapDiagnostics readerId={7} />);
  const reports = container.querySelectorAll('[data-cy="attractap-diagnostics-report"]');
  expect(reports[0].querySelector('[data-cy="attractap-diagnostics-coredump-pending"]')?.textContent).toBe(
    'coredumpPending',
  );
  expect(reports[0].querySelector('[data-cy="attractap-diagnostics-coredump-pending-hint"]')).toBeTruthy();
  expect(reports[0].textContent).not.toContain('noCoredump');
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-orphan-coredump"]')?.textContent).toBe(
    'orphanCoredump',
  );
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-orphan-coredump"]')?.className).toContain(
    'chip--default',
  );
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-reboot-reason"]')).toBeNull();
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-orphan-hint"]')).toBeTruthy();
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-download-coredump"]')).toBeTruthy();
  expect(reports[2].textContent).toContain('noCoredump');
  expect(reports[2].querySelector('[data-cy="attractap-diagnostics-coredump-pending"]')).toBeNull();
});
it('shows a coredump the server refused instead of claiming there was none', () => {
  const refused = { createdAt: report.createdAt, resetReason: 'PANIC', coredumpStatus: 'rejected', coredumpSize: null };
  state.reports = [
    { ...refused, id: 14, coredumpExpectedSize: 140000 },
    { ...refused, id: 15, coredumpExpectedSize: null },
  ];
  const { container } = render(<AttractapDiagnostics readerId={7} />);
  const reports = container.querySelectorAll('[data-cy="attractap-diagnostics-report"]');
  expect(reports[0].querySelector('[data-cy="attractap-diagnostics-coredump-rejected"]')?.textContent).toBe(
    'coredumpRejected',
  );
  // A refused dump is still in the reader's flash: worth a look, unlike a recovered one.
  expect(reports[0].querySelector('[data-cy="attractap-diagnostics-coredump-rejected"]')?.className).toContain(
    'chip--warning',
  );
  expect(reports[0].querySelector('[data-cy="attractap-diagnostics-coredump-rejected-hint"]')?.textContent).toBe(
    'coredumpRejectedHint',
  );
  // Without a valid announced size the hint does not show a placeholder size.
  expect(reports[1].querySelector('[data-cy="attractap-diagnostics-coredump-rejected-hint"]')?.textContent).toBe(
    'coredumpRejectedHintNoSize',
  );
  expect(container.textContent).not.toContain('noCoredump');
});
it('refreshes the reports while a recent coredump is still being uploaded or symbolicated', () => {
  render(<AttractapDiagnostics readerId={7} />);
  const { refetchInterval } = state.query.mock.calls[0][2] as {
    refetchInterval: (query: { state: { data?: unknown[] } }) => number | false;
  };
  const recent = new Date(Date.now() - 60_000).toISOString();
  expect(
    refetchInterval({
      state: {
        data: [
          { coredumpStatus: 'awaiting', createdAt: recent },
          { coredumpStatus: 'stored', createdAt: recent },
        ],
      },
    }),
  ).toBe(10_000);
  // The server stores an uploaded dump before it symbolicates it.
  expect(
    refetchInterval({
      state: { data: [{ coredumpStatus: 'stored', symbolicationStatus: 'pending', createdAt: recent }] },
    }),
  ).toBe(10_000);
  expect(
    refetchInterval({
      state: { data: [{ coredumpStatus: 'stored', symbolicationStatus: 'success', createdAt: recent }] },
    }),
  ).toBe(false);
  expect(refetchInterval({ state: {} })).toBe(false);
});
it('stops refreshing for a pending report older than an hour', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  const at = (ageMs: number) => new Date(now - ageMs).toISOString();
  expect(
    hasPendingCoredump([{ coredumpStatus: 'awaiting', createdAt: at(PENDING_COREDUMP_POLL_WINDOW_MS - 1) }], now),
  ).toBe(true);
  expect(
    hasPendingCoredump([{ coredumpStatus: 'awaiting', createdAt: at(PENDING_COREDUMP_POLL_WINDOW_MS) }], now),
  ).toBe(false);
  expect(
    hasPendingCoredump(
      [
        {
          coredumpStatus: 'stored',
          symbolicationStatus: 'pending',
          createdAt: at(2 * PENDING_COREDUMP_POLL_WINDOW_MS),
        },
      ],
      now,
    ),
  ).toBe(false);
});
