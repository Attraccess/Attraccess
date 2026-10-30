import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { describe, expect, it, vi } from 'vitest';
import { AttractapList } from './index';
import { useDeviceEnrollmentStore } from '../../../stores/deviceEnrollment.store';

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
    PageHeader: ({
      title,
      actions = [],
    }: {
      title: string;
      actions?: Array<{ key: string; label: string; variant?: string; onPress?: () => void }>;
    }) => (
      <>
        <h1>{title}</h1>
        {actions.map((action) => (
          <button key={action.key} data-variant={action.variant} onClick={action.onPress}>
            {action.label}
          </button>
        ))}
      </>
    ),
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
vi.mock('../HardwareSetup/WebSerialConsole', () => ({
  WebSerialConsole: ({ children }: { children: (fn: () => void) => React.ReactNode }) => <>{children(vi.fn())}</>,
}));
vi.mock('../AttractapEditor/AttractapEditor', () => ({ AttractapEditor: () => null }));
vi.mock('./delete', () => ({ AttractapDeleteModal: () => null }));
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

describe('AttractapList enroll action', () => {
  it('opens the enroll dialog as the primary page action', () => {
    mockLicense(['attractap']);
    useDeviceEnrollmentStore.getState().close();
    render(<AttractapList />);

    const enroll = screen.getByRole('button', { name: 'enrollDevice' });
    expect(enroll).toHaveAttribute('data-variant', 'primary');
    fireEvent.click(enroll);

    expect(useDeviceEnrollmentStore.getState()).toMatchObject({ isOpen: true, code: '' });
  });
});
