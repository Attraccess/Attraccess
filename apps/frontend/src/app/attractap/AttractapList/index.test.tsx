import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { AttractapList } from './index';

const data = vi.hoisted(() => ({ readers: [] as unknown[] }));

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: vi.fn(),
  useAttractapServiceGetFirmwares: () => ({ data: [] }),
  useAttractapServiceGetReaders: () => ({ data: data.readers, error: null }),
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
vi.mock('../pairing/ReadersToPair', () => ({ ReadersToPair: () => null }));
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

describe('AttractapList pairing', () => {
  const reader = (id: number, name: string, pairingState: string) => ({
    id,
    name,
    pairingState,
    lastConnection: new Date().toISOString(),
    firmware: { name: 'attractap', variant: 'touch', version: '1.0.0' },
  });

  it('lists only paired readers in the tables; the others wait in the Not paired card', () => {
    mockLicense(['attractap']);
    data.readers = [
      reader(1, 'Paired door', 'paired'),
      reader(2, 'New lathe', 'unpaired'),
      reader(3, 'Old', 'revoked'),
    ];
    render(<AttractapList />);
    expect(screen.getByText('Paired door')).toBeInTheDocument();
    expect(screen.queryByText('New lathe')).toBeNull();
    expect(screen.queryByText('Old')).toBeNull();
  });
});
