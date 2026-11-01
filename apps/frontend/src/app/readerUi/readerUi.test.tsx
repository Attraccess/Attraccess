import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderUiAlerts } from './ReaderUiAlerts';
import { ReaderUiReaderPanel } from './ReaderUiReaderPanel';
import { ResourceReaderUiSettings } from './ResourceReaderUiSettings';
import { reasonLabel } from './readerUiLabels';

const api = vi.hoisted(() => ({
  clear: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  resourceQuery: { isLoading: false, isError: false } as { isLoading: boolean; isError: boolean },
  clearPending: false,
  saveResource: vi.fn(),
  saveReader: vi.fn(),
  resourceSettings: {
    noScreenPolicy: null,
    plugins: [{ plugin: 'reservations', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' }],
  },
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: api.toastSuccess, error: api.toastError }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetReaders: () => ({ data: [{ id: 7, name: 'Laser reader' }] }),
}));
vi.mock('./readerUiApi', () => ({
  useReaderUiAlerts: () => ({
    data: [
      { id: 1, kind: 'breaker-open', message: '5 failures', plugin: 'reservations', readerId: null, createdAt: '' },
      { id: 2, kind: 'crash-loop', message: 'panic', plugin: null, readerId: 7, createdAt: '' },
    ],
  }),
  useClearReaderUiAlert: () => ({ mutate: api.clear, isPending: api.clearPending }),
  useResourceReaderUiSettings: () => ({
    ...api.resourceQuery,
    data: api.resourceQuery.isError ? undefined : api.resourceSettings,
    refetch: vi.fn(),
  }),
  useSaveResourceReaderUiSettings: () => ({ mutate: api.saveResource, isPending: false }),
  useReaderReaderUiSettings: () => ({ data: { widgetsEnabled: true } }),
  useSaveReaderReaderUiSettings: () => ({ mutate: api.saveReader, isPending: false }),
  useReaderUiContributions: () => ({
    data: [
      { plugin: 'reservations', resourceId: 3, slot: 'resource.details.header', key: 'a', status: 'rendered' },
      {
        plugin: 'reservations',
        resourceId: 3,
        slot: 'resourceList.row.status',
        key: 'b',
        status: 'skipped',
        reason: 'too long',
      },
      {
        plugin: 'reservations',
        resourceId: 3,
        slot: 'resource.details.body',
        key: 'c',
        status: 'skipped',
        reason: 'node-budget',
      },
      {
        plugin: 'reservations',
        resourceId: 99,
        slot: 'resource.details.body',
        key: 'd',
        status: 'skipped',
        reason: 'invalid-text too long',
      },
      {
        plugin: 'reservations',
        resourceId: 3,
        slot: 'provider',
        key: 'reader',
        status: 'skipped',
        reason: 'reader-oom',
      },
    ],
  }),
}));

describe('reader UI admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.resourceQuery = { isLoading: false, isError: false };
    api.clearPending = false;
  });

  it('lists alerts built from kind, plugin and reader, and clears one', async () => {
    render(<ReaderUiAlerts />);
    expect(screen.getByText('alerts.kind.breaker-open')).toBeInTheDocument();
    // The English server message is not shown; the reader of a crash-loop alert is named.
    expect(screen.queryByText(/5 failures/)).not.toBeInTheDocument();
    expect(screen.getByText(/alerts.description.breaker-open .*"plugin":"reservations"/)).toBeInTheDocument();
    expect(screen.getByText(/alerts.description.crash-loop .*"reader":"Laser reader"/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('alerts.clear')[0]);
    expect(api.clear).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('shows an error toast when clearing fails', async () => {
    api.clear.mockImplementation((_id: number, options: { onError: () => void }) => options.onError());
    render(<ReaderUiAlerts />);
    await userEvent.click(screen.getAllByText('alerts.clear')[0]);
    expect(api.toastError).toHaveBeenCalledWith({ title: 'alerts.clearError' });
  });

  it('narrows alerts to one reader', () => {
    render(<ReaderUiAlerts readerId={7} />);
    expect(screen.queryByText('alerts.kind.breaker-open')).not.toBeInTheDocument();
    expect(screen.getByText('alerts.kind.crash-loop')).toBeInTheDocument();
  });

  it('shows contributions with resource names, readable slots and translated reasons', () => {
    render(<ReaderUiReaderPanel readerId={7} resources={[{ id: 3, name: 'Laser' }]} />);
    expect(screen.getByText('reader.status.rendered')).toBeInTheDocument();
    expect(screen.getByText('reservations · Laser · reader.slot.detailsHeader')).toBeInTheDocument();
    expect(screen.getByText('reservations · Laser · reader.slot.allWidgets')).toBeInTheDocument();
    expect(screen.getByText(/reservations · reader.resourceFallback .*"id":99/)).toBeInTheDocument();
    expect(screen.getByText('reader.status.skipped: reader.reason.node-budget')).toBeInTheDocument();
    expect(screen.getByText('reader.status.skipped: reader.reason.invalid')).toBeInTheDocument();
    expect(screen.getByText('text too long')).toBeInTheDocument();
    expect(screen.getByText('reader.status.skipped: reader.reason.reader')).toBeInTheDocument();
    expect(screen.getByText('oom')).toBeInTheDocument();
    // Unknown reasons are shown as sent.
    expect(screen.getByText('too long')).toBeInTheDocument();
    expect(screen.getByText('reader.widgets')).toBeInTheDocument();
  });

  it('saves the reader widget switch immediately with feedback', async () => {
    api.saveReader.mockImplementation((_s: unknown, options: { onSuccess: () => void }) => options.onSuccess());
    render(<ReaderUiReaderPanel readerId={7} />);
    expect(screen.getByText('reader.savedImmediately')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch'));
    expect(api.saveReader).toHaveBeenCalledWith({ widgetsEnabled: false }, expect.any(Object));
    expect(api.toastSuccess).toHaveBeenCalledWith({ title: 'reader.saved' });
  });

  it('enables Save only after a change and saves the resource settings', async () => {
    render(<ResourceReaderUiSettings resourceId={3} />);
    expect(screen.getByText('reservations')).toBeInTheDocument();
    const save = screen.getByText('resource.save').closest('button') as HTMLButtonElement;
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('switch'));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(api.saveResource).toHaveBeenCalledWith(
      {
        noScreenPolicy: null,
        plugins: [{ plugin: 'reservations', widgetsEnabled: false, hookFailurePolicy: 'fail-closed' }],
      },
      expect.any(Object),
    );
  });

  it('shows an error instead of spinning when the settings fail to load', () => {
    api.resourceQuery = { isLoading: false, isError: true };
    render(<ResourceReaderUiSettings resourceId={3} />);
    expect(screen.getByText('resource.loadError')).toBeInTheDocument();
    expect(screen.getByText('resource.retry')).toBeInTheDocument();
  });
});

describe('reasonLabel', () => {
  it('translates host codes, keeps the detail of prefixed ones and shows unknown ones as is', () => {
    expect(reasonLabel('invalid')).toEqual({ key: 'reader.reason.invalid' });
    expect(reasonLabel('invalid-text-too-long')).toEqual({ key: 'reader.reason.invalid', detail: 'text-too-long' });
    expect(reasonLabel('reader-oom')).toEqual({ key: 'reader.reason.reader', detail: 'oom' });
    expect(reasonLabel('something-new')).toEqual({ detail: 'something-new' });
  });
});
