// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../en.json';
import de from '../de.json';
import { FabricApiError, type BackupView, type FabricBackupStatus, type RestoreValidation } from './api';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { FabricBackupSection } from './FabricBackupSection';
import { FABRIC_POLL_MS, pollBackoffMs, useFabricBackup } from './useFabricBackup';

const api = vi.hoisted(() => ({
  getFabricStatus: vi.fn(),
  createFabric: vi.fn(),
  generateRecoveryKey: vi.fn(),
  acknowledgeRecoveryKey: vi.fn(),
  rotateRecoveryKey: vi.fn(),
  backUpNow: vi.fn(),
  validateRestore: vi.fn(),
  confirmRestore: vi.fn(),
  cancelRestore: vi.fn(),
  acceptSidecarFabric: vi.fn(),
  startNewFabric: vi.fn(),
  downloadBackup: vi.fn(),
  saveBlob: vi.fn(),
  readFileAsBase64: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }));

const facts = { fabricId: 'FAB-1', rootCertFingerprint: 'AA:BB', fabricGeneration: 3, storageInstanceId: 'stor-1' };
const backup: BackupView = {
  id: 'b1',
  createdAt: '2026-11-06T10:00:00.000Z',
  trigger: 'daily',
  actor: null,
  sizeBytes: 2048,
  sha256: 'abc',
  outcome: 'succeeded',
  fabricId: 'FAB-1',
  fabricGeneration: 3,
  recoveryKeyId: 'KEY1',
  consistent: true,
};
const healthy: FabricBackupStatus = {
  sidecar: { reachable: true, state: 'initialized', reason: null, ...facts },
  recorded: facts,
  recovery: { required: false, mismatch: null },
  recoveryKey: { present: true, keyId: 'KEY1', createdAt: '2026-11-01T10:00:00.000Z', acknowledged: true },
  backups: {
    lastSuccessfulAt: '2026-11-06T10:00:00.000Z',
    lastAttempt: { at: '2026-11-06T10:00:00.000Z', outcome: 'succeeded', trigger: 'daily', reason: null },
    nextScheduledAt: '2026-11-07T10:00:00.000Z',
    retention: 10,
    stored: [backup],
  },
  actions: { canCreateFabric: false, canBackup: true, canRestore: true, canAcceptSidecar: false, canStartNew: false },
};
const noFacts = { fabricId: null, rootCertFingerprint: null, fabricGeneration: null, storageInstanceId: null };
const uninitialized: FabricBackupStatus = {
  ...healthy,
  sidecar: { reachable: true, state: 'uninitialized', reason: null, ...noFacts },
  recorded: null,
  recoveryKey: { present: false, keyId: null, createdAt: null, acknowledged: false },
  backups: { ...healthy.backups, lastSuccessfulAt: null, lastAttempt: null, nextScheduledAt: null, stored: [] },
  actions: { ...healthy.actions, canCreateFabric: true, canBackup: false, canRestore: true },
};
const recovery = (
  mismatch: NonNullable<FabricBackupStatus['recovery']['mismatch']>,
  sidecar = {},
): FabricBackupStatus => ({
  ...healthy,
  sidecar: { ...healthy.sidecar, ...sidecar },
  recovery: { required: true, mismatch },
  actions: { ...healthy.actions, canCreateFabric: false, canBackup: false },
});

const reveal = { keyId: 'KEY2', key: 'ABCD-EFGH-IJKL-MNOP', createdAt: '2026-11-13T10:00:00.000Z' };
const validation = (preflight: Partial<RestoreValidation['preflight']> = {}): RestoreValidation => ({
  validationId: 'v1',
  expiresAt: '2026-11-13T11:00:00.000Z',
  backup: {
    backupId: 'b1',
    createdAt: '2026-11-06T10:00:00.000Z',
    pluginVersion: '0.4.0-alpha.0',
    sidecarVersion: '0.4.0-alpha.0',
    fabricId: 'FAB-1',
    rootCertFingerprint: 'AA:BB',
    fabricGeneration: 3,
    recoveryKeyId: 'KEY1',
    consistent: true,
  },
  preflight: {
    sidecarState: 'initialized',
    kind: 'plain',
    currentFabricId: 'FAB-1',
    requiresTypedConfirmation: false,
    confirmationFabricId: null,
    ...preflight,
  },
});

const renderSection = (status: FabricBackupStatus) => {
  api.getFabricStatus.mockResolvedValue(status);
  return render(<FabricBackupSection />);
};

beforeEach(() => {
  api.downloadBackup.mockResolvedValue(undefined);
  api.cancelRestore.mockResolvedValue(null);
  api.readFileAsBase64.mockResolvedValue('QUJD');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  act(() => useTranslationState.setState({ language: 'en' }));
});

describe('FabricBackupSection status', () => {
  it('shows a healthy fabric with backup status and stored backups', async () => {
    renderSection(healthy);
    expect(await screen.findByText('Initialized')).toBeInTheDocument();
    expect(screen.getByText('FAB-1')).toBeInTheDocument();
    expect(screen.getByText('Last successful backup')).toBeInTheDocument();
    expect(screen.getByText('Next scheduled run')).toBeInTheDocument();
    expect(screen.getByText(/Daily · generation 3/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create fabric' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('matter-fabric-mismatch')).not.toBeInTheDocument();
    expect(screen.queryByText(/taken during recovery/)).not.toBeInTheDocument();
  });

  it('marks a stored backup that was taken during recovery', async () => {
    renderSection({ ...healthy, backups: { ...healthy.backups, stored: [{ ...backup, consistent: false }] } });
    expect(await screen.findByText(/Daily · generation 3 · .* · taken during recovery/)).toBeInTheDocument();
  });

  it('offers to create the fabric only when the sidecar is connected and uninitialized', async () => {
    renderSection(uninitialized);
    expect(await screen.findByRole('button', { name: 'Create fabric' })).toBeInTheDocument();
    cleanup();
    renderSection({ ...uninitialized, sidecar: { ...uninitialized.sidecar, reachable: false, state: 'unknown' } });
    expect(await screen.findByText('Sidecar not reachable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create fabric' })).not.toBeInTheDocument();
  });

  it('offers to restore a backup next to creating a fabric, for a fresh installation', async () => {
    const user = userEvent.setup();
    renderSection({ ...uninitialized, backups: { ...uninitialized.backups, stored: [] } });
    await user.click(await screen.findByRole('button', { name: 'Restore from backup' }));
    expect(await screen.findByLabelText(/Backup file/)).toBeInTheDocument();
  });

  it('does not offer to create a fabric while recovery is required', async () => {
    renderSection({
      ...recovery('sidecar_uninitialized', { state: 'uninitialized', ...noFacts }),
      actions: { ...healthy.actions, canCreateFabric: true },
    });
    await screen.findByText('Recovery required');
    expect(screen.queryByRole('button', { name: 'Create fabric' })).not.toBeInTheDocument();
  });

  it.each([
    ['fabric_changed', /different fabric than the one Attraccess recorded/],
    ['generation_behind', /older than what Attraccess recorded/],
    ['generation_ahead', /newer than what Attraccess recorded/],
    ['storage_instance_changed', /different instance/],
  ] as const)('explains the %s recovery state with the recorded fabric', async (mismatch, text) => {
    renderSection(recovery(mismatch, { reason: 'fabric id differs' }));
    expect(await screen.findByText('The fabric does not match this installation')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText(/Reason: fabric id differs/)).toBeInTheDocument();
    expect(screen.getByText('What Attraccess recorded')).toBeInTheDocument();
    expect(screen.getByText('Recovery')).toBeInTheDocument();
  });

  it('shows a failed last backup with its reason and the next run', async () => {
    renderSection({
      ...healthy,
      backups: {
        ...healthy.backups,
        lastAttempt: { at: '2026-11-07T10:00:00.000Z', outcome: 'failed', trigger: 'daily', reason: 'disk full' },
      },
    });
    expect(await screen.findByText('The last backup failed')).toBeInTheDocument();
    expect(screen.getByText('disk full')).toBeInTheDocument();
  });

  it('translates known failure reasons and storage reasons', async () => {
    renderSection({
      ...recovery('sidecar_recovery_required', { reason: 'storage_corrupt' }),
      backups: {
        ...healthy.backups,
        lastAttempt: {
          at: '2026-11-07T10:00:00.000Z',
          outcome: 'failed',
          trigger: 'daily',
          reason: 'recovery_required',
        },
      },
    });
    expect(await screen.findByText(/Reason: The sidecar's storage is damaged\./)).toBeInTheDocument();
    expect(screen.getByText('The fabric needs recovery first. No backup is made in this state.')).toBeInTheDocument();
  });

  it('shows the root certificate fingerprint shortened, with the whole value as its tooltip', async () => {
    const full = `${'ab12cd34'.repeat(8)}`;
    renderSection({
      ...healthy,
      sidecar: { ...healthy.sidecar, rootCertFingerprint: full },
    });
    await screen.findByText('Initialized');
    const shown = document.querySelector('[data-cy=matter-fabric-fingerprint]') as HTMLElement;
    expect(shown).toHaveTextContent('ab12cd34ab12cd34…ab12cd34');
    expect(shown).toHaveAttribute('title', full);
    const toggle = screen.getByRole('button', { name: 'Show full fingerprint' });
    await userEvent.setup().click(toggle);
    expect(shown).toHaveTextContent(full);
    expect(screen.getByRole('button', { name: 'Shorten fingerprint' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows empty and error states', async () => {
    renderSection({ ...healthy, backups: { ...healthy.backups, stored: [] } });
    expect(await screen.findByText('No backups stored yet.')).toBeInTheDocument();
    cleanup();
    api.getFabricStatus.mockRejectedValue(new Error('Failed to fetch'));
    render(<FabricBackupSection />);
    expect(await screen.findByText('The fabric status could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('warns about an unconfirmed recovery key and offers to generate a missing one', async () => {
    renderSection({ ...healthy, recoveryKey: { present: true, keyId: 'KEY1', createdAt: null, acknowledged: false } });
    expect(await screen.findByText('Recovery key not confirmed')).toBeInTheDocument();
    cleanup();
    renderSection({ ...healthy, recoveryKey: { present: false, keyId: null, createdAt: null, acknowledged: false } });
    expect(await screen.findByRole('button', { name: 'Generate recovery key' })).toBeInTheDocument();
  });

  it('backs up on demand and downloads a stored backup', async () => {
    const user = userEvent.setup();
    api.backUpNow.mockResolvedValue(backup);
    renderSection(healthy);
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(api.backUpNow).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(api.downloadBackup).toHaveBeenCalledWith('b1');
  });

  it('reports a failed backup in an error dialog', async () => {
    const user = userEvent.setup();
    api.backUpNow.mockRejectedValue(new Error('generation mismatch'));
    renderSection(healthy);
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText('The backup failed')).toBeInTheDocument();
    expect(screen.getByText('generation mismatch')).toBeInTheDocument();
  });

  it.each([
    ['busy', 'The Matter sidecar is busy with another backup or restore. Try again shortly.'],
    ['inconsistent', /disagree about the fabric/],
    ['recovery_key_mismatch', 'That is no longer the current recovery key. Reload the page.'],
  ])('translates the backend code %s of a failed backup', async (code, text) => {
    const user = userEvent.setup();
    api.backUpNow.mockRejectedValue(new FabricApiError('Raw backend text.', 409, code));
    renderSection(healthy);
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Raw backend text.')).not.toBeInTheDocument();
  });

  it('spins only the button of the running action', async () => {
    const user = userEvent.setup();
    let finish = () => undefined as void;
    api.backUpNow.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderSection(healthy);
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    const download = screen.getByRole('button', { name: 'Download' });
    expect(download).toBeDisabled();
    expect(download).not.toHaveAttribute('data-pending');
    expect(document.querySelector('[data-cy=matter-backup-now]')).toHaveAttribute('data-pending', 'true');
    await act(async () => finish());
  });

  it.each([
    ['recovery', recovery('fabric_changed'), 'Not available while the fabric needs recovery.'],
    [
      'no key',
      {
        ...healthy,
        recoveryKey: { ...healthy.recoveryKey, present: false },
        actions: { ...healthy.actions, canBackup: false },
      },
      'Generate a recovery key first.',
    ],
    [
      'insecure transport',
      { ...healthy, actions: { ...healthy.actions, canBackup: false, canRestore: false } },
      /plain HTTP to another machine/,
    ],
  ] as const)('explains why "Back up now" is disabled (%s)', async (_, status, hint) => {
    renderSection(status as FabricBackupStatus);
    expect(await screen.findByRole('button', { name: 'Back up now' })).toBeDisabled();
    expect(screen.getAllByText(hint)).toHaveLength(1);
  });

  it('explains why restoring is disabled while the sidecar is unreachable', async () => {
    renderSection({
      ...healthy,
      sidecar: { ...healthy.sidecar, reachable: false, state: 'unknown' },
      actions: { ...healthy.actions, canBackup: false, canRestore: false },
    });
    expect(await screen.findByRole('button', { name: 'Restore from backup' })).toBeDisabled();
    expect(screen.getByText('The sidecar is not reachable.')).toBeInTheDocument();
  });

  it('translates an interrupted restore as the storage reason', async () => {
    renderSection(recovery('sidecar_recovery_required', { state: 'recovery_required', reason: 'restore_interrupted' }));
    expect(await screen.findByText(/A restore was interrupted\. The previous storage was kept/)).toBeInTheDocument();
  });

  it('labels the loading spinner', async () => {
    api.getFabricStatus.mockReturnValue(new Promise(() => undefined));
    render(<FabricBackupSection />);
    expect(screen.getByLabelText('Loading the fabric status')).toBeInTheDocument();
  });

  it('formats backup sizes for the current language', async () => {
    act(() => useTranslationState.setState({ language: 'de' }));
    renderSection({ ...healthy, backups: { ...healthy.backups, stored: [{ ...backup, sizeBytes: 1536 }] } });
    expect(await screen.findByText(/Täglich · Generation 3 · 1,5 KiB/)).toBeInTheDocument();
  });
});

describe('recovery key reveal', () => {
  const openReveal = async () => {
    const user = userEvent.setup();
    api.createFabric.mockResolvedValue({ status: healthy, recoveryKey: reveal });
    renderSection(uninitialized);
    await user.click(await screen.findByRole('button', { name: 'Create fabric' }));
    await screen.findByText('Your recovery key');
    return user;
  };

  it('cannot be dismissed without the acknowledgement, then acknowledges and forgets the key', async () => {
    const user = await openReveal();
    expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByText('Your recovery key')).toBeInTheDocument();
    expect(api.acknowledgeRecoveryKey).not.toHaveBeenCalled();

    api.acknowledgeRecoveryKey.mockResolvedValue(healthy);
    await user.click(screen.getByRole('checkbox'));
    expect(done).toBeEnabled();
    await user.click(done);
    await waitFor(() => expect(api.acknowledgeRecoveryKey).toHaveBeenCalledWith('KEY2'));
    await waitFor(() => expect(screen.queryByText('Your recovery key')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('ABCD-EFGH-IJKL-MNOP');
  });

  it('stays open when the acknowledgement fails', async () => {
    const user = await openReveal();
    api.acknowledgeRecoveryKey.mockRejectedValue(new Error('offline'));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument();
  });

  it('offers copy and download of the key', async () => {
    const user = await openReveal();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-IJKL-MNOP');
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Copied');
    await user.click(screen.getByRole('button', { name: 'Download as .txt' }));
    expect(api.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'attraccess-matter-recovery-key-KEY2.txt');
  });

  it('shows a rotated key through the same reveal after confirming', async () => {
    const user = userEvent.setup();
    api.rotateRecoveryKey.mockResolvedValue(reveal);
    renderSection(healthy);
    await user.click(await screen.findByRole('button', { name: 'Rotate recovery key' }));
    expect(api.rotateRecoveryKey).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Rotate' }));
    expect(await screen.findByText('Your recovery key')).toBeInTheDocument();
  });
});

describe('restore wizard', () => {
  const openWizard = async (status = healthy) => {
    const user = userEvent.setup();
    renderSection(status);
    await user.click(await screen.findByRole('button', { name: 'Restore from backup' }));
    return user;
  };
  const uploadFile = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('radio', { name: 'Upload a file' }));
    await user.upload(
      screen.getByLabelText(/Backup file/),
      new File(['x'], 'x.attraccess-matter-backup', { type: 'application/octet-stream' }),
    );
  };

  it('asks for the recovery key when the backup needs one, then proceeds', async () => {
    const user = await openWizard();
    api.validateRestore.mockRejectedValueOnce(new FabricApiError('key', 422, 'key_required'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/encrypted with a different recovery key/)).toBeInTheDocument();
    api.validateRestore.mockResolvedValueOnce(validation());
    await user.type(screen.getByLabelText(/Recovery key/), 'ABCD');
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Restore now')).toBeInTheDocument();
    expect(api.validateRestore).toHaveBeenLastCalledWith({ type: 'stored', backupId: 'b1' }, 'ABCD');
  });

  it.each([
    ['wrong_key', /recovery key is wrong/],
    ['corrupt', /corrupt or has been modified/],
    ['truncated', /incomplete/],
    ['incompatible_schema', /storage schema version/],
    ['incompatible_version', /plugin version must match/],
    ['incompatible_migration', /different plugin database version/],
    ['stage_failed', /could not prepare the backup/],
    ['insecure_transport', /plain HTTP to another machine/],
    ['sidecar_unavailable', /cannot be reached/],
    ['busy', /busy with another backup or restore/],
  ])('shows a specific message for %s', async (code, text) => {
    const user = await openWizard();
    api.validateRestore.mockRejectedValue(new FabricApiError('raw', 422, code));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText('raw')).not.toBeInTheDocument();
  });

  it('validates an uploaded file as base64', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation());
    await uploadFile(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Restore now');
    expect(api.validateRestore).toHaveBeenCalledWith({ type: 'upload', contentBase64: 'QUJD' }, undefined);
  });

  it('says when the chosen file cannot be read', async () => {
    const user = await openWizard();
    api.readFileAsBase64.mockRejectedValue(new FabricApiError('', 0, 'file_unreadable'));
    await uploadFile(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('The file could not be read. Choose it again.')).toBeInTheDocument();
  });

  it('falls back to the HTTP status when an error carries neither a known code nor a message', async () => {
    const user = await openWizard();
    api.validateRestore.mockRejectedValue(new FabricApiError('', 502, null));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('The request failed (HTTP 502).')).toBeInTheDocument();
  });

  it('refuses an empty or a too large file before sending anything', async () => {
    const user = await openWizard();
    await user.click(screen.getByRole('radio', { name: 'Upload a file' }));
    await user.upload(screen.getByLabelText(/Backup file/), new File([], 'e.attraccess-matter-backup'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('The file is empty. Choose the backup file you downloaded.')).toBeInTheDocument();
    const large = new File(['x'], 'l.attraccess-matter-backup');
    Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/Backup file/), large);
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/too large to upload here \(at most 7 MB\)/)).toBeInTheDocument();
    expect(api.validateRestore).not.toHaveBeenCalled();
  });

  it('mentions the automatic backup only when a healthy fabric is overwritten', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(
      validation({ requiresTypedConfirmation: false, sidecarState: 'uninitialized', kind: 'plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Restore now');
    expect(screen.queryByText(/A backup of the current state is taken first/)).not.toBeInTheDocument();
    expect(screen.queryByText('This backup was taken during recovery')).not.toBeInTheDocument();
  });

  it('warns in the preview that a backup taken during recovery brings the mismatch back', async () => {
    const user = await openWizard();
    const inconsistent = validation();
    api.validateRestore.mockResolvedValue({ ...inconsistent, backup: { ...inconsistent.backup, consistent: false } });
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('This backup was taken during recovery')).toBeInTheDocument();
    expect(screen.getByText(/Restoring it brings that mismatch back/)).toBeInTheDocument();
  });

  it('restores without typed confirmation when nothing healthy is overwritten', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation({ sidecarState: 'recovery_required', currentFabricId: null }));
    api.confirmRestore.mockResolvedValue({ outcome: 'succeeded', status: healthy });
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText('Restore completed')).toBeInTheDocument();
    expect(api.confirmRestore).toHaveBeenCalledWith('v1', undefined);
  });

  it('requires typing the fabric ID before overwriting a healthy fabric', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(
      validation({
        kind: 'replacement',
        requiresTypedConfirmation: true,
        confirmationFabricId: 'FAB-9',
        currentFabricId: 'FAB-9',
      }),
    );
    api.confirmRestore.mockResolvedValue({ outcome: 'succeeded', status: healthy });
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    const confirm = await screen.findByRole('button', { name: 'Restore now' });
    expect(screen.getByText('This overwrites a working fabric')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    const input = screen.getByLabelText(/Type the current fabric ID FAB-9/);
    await user.type(input, 'FAB-8');
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'FAB-9');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(api.confirmRestore).toHaveBeenCalledWith('v1', 'FAB-9'));
  });

  it.each([
    ['rolled_back', 'The restore failed and was rolled back. Your installation was left unchanged.'],
    [
      'restore_failed',
      'The Matter sidecar could not apply or verify the backup. Your installation was left unchanged.',
    ],
  ])('says once that the installation was left unchanged after %s', async (code, text) => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation());
    api.confirmRestore.mockRejectedValue(new FabricApiError('Raw backend text.', 409, code));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText('The restore failed')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByText(/left unchanged/)).toHaveLength(1);
    expect(screen.queryByText('Raw backend text.')).not.toBeInTheDocument();
  });

  it('does not claim an unchanged installation when the sidecar could not be rolled back', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation());
    api.confirmRestore.mockRejectedValue(new FabricApiError('raw', 500, 'rollback_failed'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText('The restore failed and could not be rolled back')).toBeInTheDocument();
    expect(screen.getByText(/could not be rolled back automatically, so its state is unknown/)).toBeInTheDocument();
    expect(screen.queryByText(/left unchanged/)).not.toBeInTheDocument();
  });

  it('requires typing the fabric ID before rolling back a healthy fabric', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(
      validation({ kind: 'rollback', requiresTypedConfirmation: true, confirmationFabricId: 'FAB-1' }),
    );
    api.confirmRestore.mockResolvedValue({ outcome: 'succeeded', status: healthy });
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    const confirm = await screen.findByRole('button', { name: 'Restore now' });
    expect(screen.getByText('Roll back to an earlier state')).toBeInTheDocument();
    expect(screen.getByText(/A backup of the current state is taken first/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Type the current fabric ID FAB-1/), 'FAB-1');
    await user.click(confirm);
    expect(await screen.findByText('Restore completed')).toBeInTheDocument();
    expect(api.confirmRestore).toHaveBeenCalledWith('v1', 'FAB-1');
  });

  it('stays on the preview with the reason when the typed confirmation is refused', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(
      validation({ kind: 'replacement', requiresTypedConfirmation: true, confirmationFabricId: 'FAB-9' }),
    );
    api.confirmRestore.mockRejectedValue(new FabricApiError('raw', 409, 'confirmation_required'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.type(await screen.findByLabelText(/Type the current fabric ID FAB-9/), 'FAB-9');
    await user.click(screen.getByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText('Type the fabric ID to confirm.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore now' })).toBeInTheDocument();
    expect(screen.queryByText('The restore failed')).not.toBeInTheDocument();
  });

  it.each([
    ['validation_expired', 'This check has expired. Validate the backup again.'],
    ['preflight_changed', 'The sidecar changed since the backup was checked. Validate the backup again.'],
    ['busy', 'The Matter sidecar is busy with another backup or restore. Try again shortly.'],
  ])('goes back to validating, keeping the source and key, after %s', async (code, text) => {
    const user = await openWizard();
    api.validateRestore.mockRejectedValueOnce(new FabricApiError('key', 422, 'key_required'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.type(await screen.findByLabelText(/Recovery key/), 'ABCD');
    api.validateRestore.mockResolvedValue(validation());
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    api.confirmRestore.mockRejectedValueOnce(new FabricApiError('raw', 409, code));
    await user.click(await screen.findByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText('Validate the backup again')).toBeInTheDocument();
    expect(screen.getByLabelText(/Recovery key/)).toHaveValue('ABCD');
    expect(screen.getByRole('radio', { name: /Stored backup/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByRole('button', { name: 'Restore now' });
    expect(api.validateRestore).toHaveBeenLastCalledWith({ type: 'stored', backupId: 'b1' }, 'ABCD');
  });

  it('cancels the staged restore when closed from the preview', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation());
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByRole('button', { name: 'Restore now' });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(api.cancelRestore).toHaveBeenCalledWith('v1'));
  });
});

describe('recovery panel', () => {
  it('offers restore, accept and start-new according to the sidecar state', async () => {
    renderSection({
      ...recovery('fabric_changed'),
      actions: { ...healthy.actions, canAcceptSidecar: true, canStartNew: false },
    });
    expect(await screen.findByRole('button', { name: "Accept sidecar's fabric" })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Start new fabric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore from backup' })).toBeEnabled();
  });

  it('accepts the sidecar fabric only after confirming', async () => {
    const user = userEvent.setup();
    api.acceptSidecarFabric.mockResolvedValue(healthy);
    renderSection({ ...recovery('fabric_changed'), actions: { ...healthy.actions, canAcceptSidecar: true } });
    await user.click(await screen.findByRole('button', { name: "Accept sidecar's fabric" }));
    expect(api.acceptSidecarFabric).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api.acceptSidecarFabric).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Recovery')).not.toBeInTheDocument());
  });

  it('warns that every device must be factory-reset before starting a new fabric, then reveals the key', async () => {
    const user = userEvent.setup();
    api.startNewFabric.mockResolvedValue({ status: healthy, recoveryKey: reveal });
    renderSection({
      ...recovery('sidecar_uninitialized', { state: 'uninitialized', ...noFacts }),
      actions: { ...healthy.actions, canStartNew: true },
    });
    await user.click(await screen.findByRole('button', { name: 'Start new fabric' }));
    expect(await screen.findByText(/must be factory-reset and commissioned again/)).toBeInTheDocument();
    expect(api.startNewFabric).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Start new fabric' }));
    expect(await screen.findByText('Your recovery key')).toBeInTheDocument();
  });
});

describe('recovery panel failures and sidecar recovery', () => {
  it('offers only restore while the sidecar itself needs recovery', async () => {
    renderSection(
      recovery('sidecar_recovery_required', { state: 'recovery_required', reason: 'storage_corrupt', ...noFacts }),
    );
    expect(await screen.findByRole('button', { name: "Accept sidecar's fabric" })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start new fabric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore from backup' })).toBeEnabled();
    expect(screen.getByText('Only available while the sidecar runs a healthy fabric.')).toBeInTheDocument();
    expect(screen.getByText('Only available while the sidecar has no fabric.')).toBeInTheDocument();
  });

  it('explains why restoring is unavailable in the recovery panel', async () => {
    renderSection({ ...recovery('fabric_changed'), actions: { ...healthy.actions, canRestore: false } });
    await screen.findByText('Recovery');
    const panel = document.querySelector('[data-cy=matter-recovery-panel]') as HTMLElement;
    expect(within(panel).getByRole('button', { name: 'Restore from backup' })).toBeDisabled();
    expect(within(panel).getByText(/plain HTTP to another machine/)).toBeInTheDocument();
  });

  it('reports a failed accept in an error dialog with the translated reason', async () => {
    const user = userEvent.setup();
    api.acceptSidecarFabric.mockRejectedValue(new FabricApiError('Raw.', 409, 'sidecar_not_initialized'));
    renderSection({ ...recovery('fabric_changed'), actions: { ...healthy.actions, canAcceptSidecar: true } });
    await user.click(await screen.findByRole('button', { name: "Accept sidecar's fabric" }));
    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('The recovery action failed')).toBeInTheDocument();
    expect(screen.getByText('The sidecar has no healthy fabric to accept.')).toBeInTheDocument();
  });

  it('reports a failed start of a new fabric in an error dialog with the translated reason', async () => {
    const user = userEvent.setup();
    api.startNewFabric.mockRejectedValue(new FabricApiError('Raw.', 409, 'sidecar_not_empty'));
    renderSection({
      ...recovery('sidecar_uninitialized', { state: 'uninitialized', ...noFacts }),
      actions: { ...healthy.actions, canStartNew: true },
    });
    await user.click(await screen.findByRole('button', { name: 'Start new fabric' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Start new fabric' }));
    expect(await screen.findByText('The recovery action failed')).toBeInTheDocument();
    expect(screen.getByText('A new fabric can only be started while the sidecar has no fabric.')).toBeInTheDocument();
  });
});

describe('status polling', () => {
  let hidden = false;
  beforeEach(() => {
    hidden = false;
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'hidden');
  });

  it('does not poll while the page is hidden and refreshes when it is shown again', async () => {
    api.getFabricStatus.mockResolvedValue(healthy);
    renderHook(() => useFabricBackup());
    await act(() => vi.advanceTimersByTimeAsync(FABRIC_POLL_MS));
    expect(api.getFabricStatus).toHaveBeenCalledTimes(2);
    hidden = true;
    await act(() => vi.advanceTimersByTimeAsync(FABRIC_POLL_MS * 3));
    expect(api.getFabricStatus).toHaveBeenCalledTimes(2);
    hidden = false;
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.getFabricStatus).toHaveBeenCalledTimes(3);
  });

  it('backs off while the status keeps failing', async () => {
    api.getFabricStatus.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFabricBackup());
    await act(() => vi.advanceTimersByTimeAsync(FABRIC_POLL_MS));
    expect(result.current.error).toBe('offline');
    expect(api.getFabricStatus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(FABRIC_POLL_MS));
    expect(api.getFabricStatus).toHaveBeenCalledTimes(2);
    expect(pollBackoffMs(0)).toBe(0);
    expect(pollBackoffMs(2)).toBe(FABRIC_POLL_MS * 4);
    expect(pollBackoffMs(20)).toBe(5 * 60_000);
  });
});

describe('translations', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix];

  it('has the same keys in English and German', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });
});
