// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../en.json';
import de from '../de.json';
import { FabricApiError, type BackupView, type FabricBackupStatus, type RestoreValidation } from './api';
import { FabricBackupSection } from './FabricBackupSection';

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
  });

  it('offers to create the fabric only when the sidecar is connected and uninitialized', async () => {
    renderSection(uninitialized);
    expect(await screen.findByRole('button', { name: 'Create fabric' })).toBeInTheDocument();
    cleanup();
    renderSection({ ...uninitialized, sidecar: { ...uninitialized.sidecar, reachable: false, state: 'unknown' } });
    expect(await screen.findByText('Sidecar not reachable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create fabric' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Upload a file' }));
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

  it('says the installation was left unchanged when the restore fails', async () => {
    const user = await openWizard();
    api.validateRestore.mockResolvedValue(validation());
    api.confirmRestore.mockRejectedValue(new FabricApiError('verification failed', 409, 'rolled_back'));
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await user.click(await screen.findByRole('button', { name: 'Restore now' }));
    expect(await screen.findByText('The restore failed')).toBeInTheDocument();
    expect(screen.getByText(/Your installation was left unchanged/)).toBeInTheDocument();
    expect(screen.getByText('verification failed')).toBeInTheDocument();
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

describe('translations', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix];

  it('has the same keys in English and German', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });
});
