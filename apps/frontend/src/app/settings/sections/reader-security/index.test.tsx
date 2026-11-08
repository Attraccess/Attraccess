import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttractapServiceGetSecureBootKeys } from '@attraccess/react-query-client';
import { ReaderSecuritySection } from './index';

const mutations = vi.hoisted(() => {
  const make = () => ({
    mutateAsync: vi.fn(() => Promise.resolve()),
    reset: vi.fn(),
    isPending: false,
    error: null as unknown,
  });
  return {
    create: make(),
    downloadRecovery: make(),
    downloadBackup: make(),
    check: make(),
    restore: make(),
  };
});
const license = vi.hoisted(() => ({ data: { modules: ['attractap'] } as { modules: string[] } | undefined }));

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetSecureBootKeys: vi.fn(),
  useAttractapServiceGetSecureBootKeysKey: 'keys',
  useAttractapServiceCreateSecureBootKeys: () => mutations.create,
  useAttractapServiceDownloadRecoveryKey: () => mutations.downloadRecovery,
  useAttractapServiceDownloadSigningKeyBackup: () => mutations.downloadBackup,
  useAttractapServiceCheckRecoveryKey: () => mutations.check,
  useAttractapServiceRestoreSecureBootKeys: () => mutations.restore,
  useLicenseServiceGetLicenseInformation: () => ({ data: license.data }),
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
const pending = { status: 'recovery-check-pending', signingKey: key, recoveryKey: { ...key, verifiedAt: null } };
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

/** A promise the test settles by hand, standing in for a request that is still running. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const field = (cy: string) => document.querySelector(`[data-cy="${cy}"]`) as HTMLInputElement;

/** Picks a key file and types its passphrase in the open KeyFileDialog, then submits it. */
async function submitKeyFile(passphrase = 'file passphrase') {
  const file = Object.assign(new File(['PEM'], 'key.pem'), { text: () => Promise.resolve('PEM') });
  await act(async () => {
    fireEvent.change(field('reader-security-key-file'), { target: { files: [file] } });
  });
  fireEvent.change(field('reader-security-file-passphrase'), { target: { value: passphrase } });
  fireEvent.submit(field('reader-security-file-passphrase').closest('form') as HTMLFormElement);
}

describe('ReaderSecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    license.data = { modules: ['attractap'] };
    for (const mutation of Object.values(mutations)) mutation.mutateAsync.mockImplementation(() => Promise.resolve());
  });

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
    keys(pending);
    render(<ReaderSecuritySection />);
    expect(screen.getByText('actions.downloadRecovery')).toBeInTheDocument();
    expect(screen.getByText('actions.checkRecovery')).toBeInTheDocument();
    expect(screen.getByText('whatToBackup.secret')).toBeInTheDocument();
    expect(screen.getByText('whatToBackup.signingBackup')).toBeInTheDocument();
    fireEvent.click(screen.getByText('actions.downloadRecovery'));
    expect(screen.getByText('recovery.description')).toBeInTheDocument();
  });

  it('labels keys restored from a backup that still wait for the recovery check', () => {
    keys({ ...pending, restored: true });
    render(<ReaderSecuritySection />);
    expect(field('reader-security-status')).toHaveTextContent('status.restoredPending');
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
    expect(screen.getByText('locked')).toBeInTheDocument();
  });

  it('sends a fast double press on "create" only once', async () => {
    const request = deferred();
    mutations.create.mutateAsync.mockImplementationOnce(() => request.promise);
    keys({});
    render(<ReaderSecuritySection />);
    const button = screen.getByText('actions.create');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(1);

    // Once the request settles, the next press goes through again.
    await act(async () => request.resolve());
    fireEvent.click(button);
    expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('frees the key actions when a request settles after its dialog was closed and another opened', async () => {
    // Regression: opening a dialog resets every mutation, which in TanStack Query detaches the
    // observer that per-call `onSettled` callbacks hang on. The guard then never released and every
    // later submit was silently dropped.
    const request = deferred();
    mutations.check.mutateAsync.mockImplementationOnce(() => request.promise);
    keys(pending);
    render(<ReaderSecuritySection />);

    fireEvent.click(screen.getByText('actions.checkRecovery'));
    await submitKeyFile();
    expect(mutations.check.mutateAsync).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('actions.restore'));
    expect(mutations.check.reset).toHaveBeenCalled();
    await act(async () => request.reject(new Error('wrong passphrase')));

    await submitKeyFile();
    expect(mutations.restore.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('opens a dialog without the error of an earlier attempt', () => {
    keys(pending);
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

  it('says the module is not licensed instead of offering key actions', () => {
    license.data = { modules: ['sso'] };
    keys({});
    render(<ReaderSecuritySection />);
    expect(screen.getByText('notLicensed')).toBeInTheDocument();
    expect(screen.queryByText('actions.create')).not.toBeInTheDocument();
    expect(screen.queryByText('retry')).not.toBeInTheDocument();
  });

  it('submits the passphrase dialog with Enter once the passphrases are valid', () => {
    keys(pending);
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.downloadRecovery'));
    const first = field('reader-security-passphrase');
    const repeat = field('reader-security-passphrase-repeat');
    const form = first.closest('form') as HTMLFormElement;
    expect(screen.getByText('passphrase.minLength')).toBeInTheDocument();

    fireEvent.change(first, { target: { value: 'too short' } });
    fireEvent.change(repeat, { target: { value: 'too short' } });
    fireEvent.submit(form);
    expect(mutations.downloadRecovery.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(first, { target: { value: 'long enough passphrase' } });
    fireEvent.change(repeat, { target: { value: 'long enough passphrase' } });
    fireEvent.submit(form);
    expect(mutations.downloadRecovery.mutateAsync).toHaveBeenCalledWith({
      requestBody: { passphrase: 'long enough passphrase' },
    });
  });

  it('does not submit while the repeated passphrase differs, and says so on the repeat field', () => {
    keys(pending);
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.downloadBackup'));
    fireEvent.change(field('reader-security-passphrase'), { target: { value: 'long enough passphrase' } });
    fireEvent.change(field('reader-security-passphrase-repeat'), { target: { value: 'long enough passphrasX' } });
    fireEvent.submit(field('reader-security-passphrase').closest('form') as HTMLFormElement);
    expect(mutations.downloadBackup.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('passphrase.mismatch')).toBeInTheDocument();
  });

  it('restores with the chosen source, file and passphrase, and warns that the current key is replaced', async () => {
    keys(pending);
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.restore'));
    expect(field('reader-security-restore-replaces')).toBeInTheDocument();
    expect(screen.getByText('restore.sourceLabel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('restore.source.recovery-file'));
    await submitKeyFile('recovery passphrase');
    expect(mutations.restore.mutateAsync).toHaveBeenCalledWith({
      requestBody: { pem: 'PEM', passphrase: 'recovery passphrase', source: 'recovery-file' },
    });
  });

  it('does not warn about replacing keys when restoring into an installation without keys', () => {
    keys({});
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.restore'));
    expect(screen.getByText('restore.sourceLabel')).toBeInTheDocument();
    expect(field('reader-security-restore-replaces')).toBeNull();
  });

  it('regenerates the keys only after the confirmation', () => {
    keys({ status: 'ready', signingKey: key, recoveryKey: { ...key, verifiedAt: '2026-11-08T10:00:00Z' } });
    render(<ReaderSecuritySection />);
    fireEvent.click(screen.getByText('actions.regenerate'));
    expect(mutations.create.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('regenerate.confirm'));
    expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(1);
  });
});
