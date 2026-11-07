import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttractapServiceGetSecureBootKeys } from '@attraccess/react-query-client';
import { ReaderSecuritySection } from './index';

const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetSecureBootKeys: vi.fn(),
  useAttractapServiceGetSecureBootKeysKey: 'keys',
  useAttractapServiceCreateSecureBootKeys: () => mutation(),
  useAttractapServiceDownloadRecoveryKey: () => mutation(),
  useAttractapServiceDownloadSigningKeyBackup: () => mutation(),
  useAttractapServiceCheckRecoveryKey: () => mutation(),
  useAttractapServiceRestoreSecureBootKeys: () => mutation(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => () => 'then',
}));

const key = { digest: 'd', fingerprint: 'f'.repeat(64), restoredAt: null };
function keys(overrides: object) {
  vi.mocked(useAttractapServiceGetSecureBootKeys).mockReturnValue({
    data: {
      status: 'none',
      restored: false,
      signingKey: null,
      recoveryKey: null,
      readersWithBurnedDigests: 0,
      restoreAllowed: true,
      ...overrides,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useAttractapServiceGetSecureBootKeys>);
}

describe('ReaderSecuritySection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers only key creation and restore while there are no keys', () => {
    keys({});
    render(<ReaderSecuritySection />);
    expect(document.querySelector('[data-cy="reader-security-status"]')).toHaveTextContent('status.none');
    expect(screen.getByText('actions.create')).toBeInTheDocument();
    expect(screen.getByText('actions.restore')).toBeInTheDocument();
    expect(screen.queryByText('actions.downloadRecovery')).not.toBeInTheDocument();
    expect(screen.queryByText('actions.downloadBackup')).not.toBeInTheDocument();
  });

  it('shows recovery download and check while the check is pending, and the backup warning text', () => {
    keys({ status: 'recovery-check-pending', signingKey: key, recoveryKey: { ...key, verifiedAt: null } });
    render(<ReaderSecuritySection />);
    expect(screen.getByText('actions.downloadRecovery')).toBeInTheDocument();
    expect(screen.getByText('actions.checkRecovery')).toBeInTheDocument();
    expect(screen.getByText('whatToBackup.secret')).toBeInTheDocument();
    fireEvent.click(screen.getByText('actions.downloadRecovery'));
    expect(screen.getByText('recovery.description')).toBeInTheDocument();
  });

  it('hides recovery actions once checked, and blocks regeneration and restore while readers are secured', () => {
    keys({
      status: 'ready',
      signingKey: key,
      recoveryKey: { ...key, verifiedAt: '2026-11-08T10:00:00Z' },
      readersWithBurnedDigests: 2,
      restoreAllowed: false,
    });
    render(<ReaderSecuritySection />);
    expect(screen.queryByText('actions.downloadRecovery')).not.toBeInTheDocument();
    expect(screen.queryByText('actions.checkRecovery')).not.toBeInTheDocument();
    expect(screen.queryByText('actions.regenerate')).not.toBeInTheDocument();
    expect(screen.queryByText('actions.restore')).not.toBeInTheDocument();
    expect(screen.getByText('actions.downloadBackup')).toBeInTheDocument();
  });
});
