import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderUiAlerts } from './ReaderUiAlerts';
import { ReaderUiReaderPanel } from './ReaderUiReaderPanel';
import { ResourceReaderUiSettings } from './ResourceReaderUiSettings';

const api = vi.hoisted(() => ({
  clear: vi.fn(),
  saveResource: vi.fn(),
  saveReader: vi.fn(),
  resourceSettings: {
    noScreenPolicy: null,
    plugins: [{ plugin: 'reservations', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' }],
  },
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('./readerUiApi', () => ({
  useReaderUiAlerts: () => ({
    data: [
      { id: 1, kind: 'breaker-open', message: '5 failures', plugin: 'reservations', readerId: null, createdAt: '' },
      { id: 2, kind: 'crash-loop', message: 'panic', plugin: null, readerId: 7, createdAt: '' },
    ],
  }),
  useClearReaderUiAlert: () => ({ mutate: api.clear, isPending: false }),
  useResourceReaderUiSettings: () => ({ isLoading: false, data: api.resourceSettings }),
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
    ],
  }),
}));

describe('reader UI admin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists alerts and clears one', async () => {
    render(<ReaderUiAlerts />);
    expect(screen.getByText('alerts.kind.breaker-open')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('alerts.clear')[0]);
    expect(api.clear).toHaveBeenCalledWith(1);
  });

  it('narrows alerts to one reader', () => {
    render(<ReaderUiAlerts readerId={7} />);
    expect(screen.queryByText('alerts.kind.breaker-open')).not.toBeInTheDocument();
    expect(screen.getByText('alerts.kind.crash-loop')).toBeInTheDocument();
  });

  it('shows the contribution status per reader and its widget switch', () => {
    render(<ReaderUiReaderPanel readerId={7} />);
    expect(screen.getByText('reader.status.rendered')).toBeInTheDocument();
    expect(screen.getByText(/reader.status.skipped: too long/)).toBeInTheDocument();
    expect(screen.getByText('reader.widgets')).toBeInTheDocument();
  });

  it('saves the resource settings', async () => {
    render(<ResourceReaderUiSettings resourceId={3} />);
    expect(screen.getByText('reservations')).toBeInTheDocument();
    await userEvent.click(screen.getByText('resource.save'));
    expect(api.saveResource).toHaveBeenCalledWith(
      {
        noScreenPolicy: null,
        plugins: [{ plugin: 'reservations', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' }],
      },
      expect.any(Object),
    );
  });
});
