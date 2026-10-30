import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { AttractapList } from './index';

const data = vi.hoisted(() => ({ readers: [] as unknown[], pairings: [] as unknown[] }));

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: vi.fn(),
  useAttractapServiceGetFirmwares: () => ({ data: [] }),
  useAttractapServiceGetReaders: () => ({ data: data.readers, error: null }),
  useAttractapServiceGetPairings: () => ({ data: data.pairings }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (k: string) => k.split('.').pop() ?? k }),
  useDateTimeFormatter: () => () => '',
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn() }) }));
vi.mock('../../../components/pageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageAction: () => null,
}));
vi.mock('../HardwareSetup', () => ({
  AttractapHardwareSetup: ({ children }: { children: (fn: () => void) => React.ReactNode }) => (
    <div data-testid="hardware-setup">{children(vi.fn())}</div>
  ),
}));
vi.mock('../HardwareSetup/WebSerialConsole', () => ({ WebSerialConsole: () => null }));
vi.mock('../AttractapEditor/AttractapEditor', () => ({ AttractapEditor: () => null }));
vi.mock('../pairing/WaitingToPair', () => ({ WaitingToPair: () => null }));
vi.mock('../pairing/PairingStateChip', () => ({
  PairingStateChip: ({ state, waiting }: { state: string; waiting?: boolean }) => (
    <span data-testid={`state-${waiting ? 'waiting' : state}`} />
  ),
}));
vi.mock('./delete', () => ({ AttractapDeleteModal: () => null }));
vi.mock('../../../hooks/useNow', () => ({ useNow: () => new Date() }));
vi.mock('../../../components/AlertStatusIcon', () => ({ AlertStatusIcon: () => null }));
vi.mock('../../../components/emptyState', () => ({ EmptyState: () => <div data-testid="empty-state" /> }));

function mockLicense(modules: string[] | undefined) {
  vi.mocked(useLicenseServiceGetLicenseInformation).mockReturnValue({
    data: modules !== undefined ? { modules } : undefined,
  } as ReturnType<typeof useLicenseServiceGetLicenseInformation>);
}

describe('AttractapList license gate', () => {
  it('renders nothing when attractap module is absent from license', () => {
    mockLicense([]);
    const { container } = render(<AttractapList />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders page when attractap module is present', () => {
    mockLicense(['attractap']);
    const { container } = render(<AttractapList />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it('renders page while license is loading (undefined)', () => {
    mockLicense(undefined);
    const { container } = render(<AttractapList />);
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe('AttractapList pairing state', () => {
  const reader = (id: number, name: string) => ({
    id,
    name,
    pairingState: 'unpaired',
    lastConnection: new Date().toISOString(),
    firmware: { name: 'attractap', variant: 'touch', version: '1.0.0' },
  });

  it('shows Waiting to pair for a reader with a running pairing bound or targeted to it', () => {
    mockLicense(['attractap']);
    data.readers = [reader(1, 'Bound'), reader(2, 'Targeted'), reader(3, 'Idle'), reader(4, 'Ended')];
    data.pairings = [
      { state: 'announced', boundReaderId: 1, targetReaderId: null },
      { state: 'awaiting-confirmation', boundReaderId: null, targetReaderId: 2 },
      { state: 'failed', boundReaderId: 4, targetReaderId: null },
    ];
    render(<AttractapList />);
    expect(screen.getAllByTestId('state-waiting')).toHaveLength(2);
    expect(screen.getAllByTestId('state-unpaired')).toHaveLength(2);
  });
});
