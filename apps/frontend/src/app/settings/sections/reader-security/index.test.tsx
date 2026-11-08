import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttractapServiceGetSecureBootKeys } from '@attraccess/react-query-client';
import { ReaderSecuritySection } from './index';

const mutations = vi.hoisted(() => {
  const make = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown });
  return {
    create: make(),
    downloadRecovery: make(),
    downloadBackup: make(),
    check: make(),
    restore: make(),
  };
});

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetSecureBootKeys: vi.fn(),
  useAttractapServiceGetSecureBootKeysKey: 'keys',
  useAttractapServiceCreateSecureBootKeys: () => mutations.create,
  useAttractapServiceDownloadRecoveryKey: () => mutations.downloadRecovery,
  useAttractapServiceDownloadSigningKeyBackup: () => mutations.downloadBackup,
  useAttractapServiceCheckRecoveryKey: () => mutations.check,
  useAttractapServiceRestoreSecureBootKeys: () => mutations.restore,
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

  it('sends a fast double press on "create" only once', () => {
    keys({});
    render(<ReaderSecuritySection />);
    const button = screen.getByText('actions.create');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mutations.create.mutate).toHaveBeenCalledTimes(1);

    // Once the request settles, the next press goes through again.
    const settle = (mutations.create.mutate.mock.calls[0][1] as { onSettled: () => void }).onSettled;
    act(() => settle());
    fireEvent.click(button);
    expect(mutations.create.mutate).toHaveBeenCalledTimes(2);
  });

  it('opens a dialog without the error of an earlier attempt', () => {
    keys({ status: 'recovery-check-pending', signingKey: key, recoveryKey: { ...key, verifiedAt: null } });
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.checkRecovery'));
    expect(mutations.check.reset).toHaveBeenCalledTimes(1);
    expect(mutations.restore.reset).toHaveBeenCalledTimes(1);
  });

  it('shows an error with a retry instead of an endless spinner when the status cannot be loaded', () => {
    const refetch = vi.fn();
    vi.mocked(useAttractapServiceGetSecureBootKeys).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useAttractapServiceGetSecureBootKeys>);
    render(<ReaderSecuritySection />);
    expect(screen.getByText('loadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('submits the passphrase dialog with Enter once the passphrases are valid', () => {
    keys({ status: 'recovery-check-pending', signingKey: key, recoveryKey: { ...key, verifiedAt: null } });
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.downloadRecovery'));
    const first = document.querySelector('[data-cy="reader-security-passphrase"]') as HTMLInputElement;
    const repeat = document.querySelector('[data-cy="reader-security-passphrase-repeat"]') as HTMLInputElement;
    const form = first.closest('form') as HTMLFormElement;

    fireEvent.change(first, { target: { value: 'too short' } });
    fireEvent.change(repeat, { target: { value: 'too short' } });
    fireEvent.submit(form);
    expect(mutations.downloadRecovery.mutate).not.toHaveBeenCalled();

    fireEvent.change(first, { target: { value: 'long enough passphrase' } });
    fireEvent.change(repeat, { target: { value: 'long enough passphrase' } });
    fireEvent.submit(form);
    expect(mutations.downloadRecovery.mutate).toHaveBeenCalledWith(
      { requestBody: { passphrase: 'long enough passphrase' } },
      expect.anything(),
    );
  });
});
