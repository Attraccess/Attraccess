import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { AttractapList } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useLicenseServiceGetLicenseInformation: vi.fn(),
  useAttractapServiceGetFirmwares: () => ({ data: [] }),
  useAttractapServiceGetReaders: () => ({ data: [], error: null }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (k: string) => k.split('.').pop() ?? k }),
    useDateTimeFormatter: () => () => '',
  }))()),
  ...(await (() => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
    PageAction: () => null,
  }))()),
  ...(await (() => ({ AlertStatusIcon: () => null }))()),
  ...(await (() => ({ EmptyState: () => <div data-testid="empty-state" /> }))()),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn() }) }));

vi.mock('../HardwareSetup', () => ({
  AttractapHardwareSetup: ({ children }: { children: (fn: () => void) => React.ReactNode }) => (
    <div data-testid="hardware-setup">{children(vi.fn())}</div>
  ),
}));
vi.mock('../HardwareSetup/WebSerialConsole', () => ({ WebSerialConsole: () => null }));
vi.mock('../AttractapEditor/AttractapEditor', () => ({ AttractapEditor: () => null }));
vi.mock('./delete', () => ({ AttractapDeleteModal: () => null }));
vi.mock('./WaitingLiteReaders', () => ({ WaitingLiteReaders: () => <div data-testid="waiting-lite" /> }));
vi.mock('../../../hooks/useNow', () => ({ useNow: () => new Date() }));

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
