import { Button, StatusAlert, StatusDialog, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Card, Chip, Spinner } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import {
  acceptSidecarFabric,
  acknowledgeRecoveryKey,
  backUpNow,
  createFabric,
  downloadBackup,
  generateRecoveryKey,
  rotateRecoveryKey,
  startNewFabric,
  type BackupView,
  type FabricBackupStatus,
  type RecoveryKeyReveal,
} from './api';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { RecoveryPanel } from './RecoveryPanel';
import { RestoreWizard } from './RestoreWizard';
import { useFabricBackup } from './useFabricBackup';

type Notice = { title: string; message: string } | null;

/** The leading and trailing hex digits are enough to tell certificates apart; the whole value is in the tooltip. */
export const shortFingerprint = (value: string) =>
  value.length > 28 ? `${value.slice(0, 16)}…${value.slice(-8)}` : value;

const BACKUP_FAILURE_REASONS = [
  'inconsistent',
  'sidecar_unavailable',
  'sidecar_busy',
  'insecure_transport',
  'no_recovery_key',
  'recovery_key_unreadable',
  'recovery_required',
  'no_fabric',
  'sidecar_error',
  'internal',
];
const STORAGE_REASONS = [
  'storage_unreadable',
  'storage_corrupt',
  'storage_incomplete',
  'schema_mismatch',
  'metadata_missing',
  'metadata_orphaned',
];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:flex-col">
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-all">{children}</dd>
    </div>
  );
}

function stateChip(status: FabricBackupStatus): { color: 'danger' | 'success' | 'warning' | 'default'; key: string } {
  if (status.recovery.required) return { color: 'danger', key: 'recovery_required' };
  if (!status.sidecar.reachable) return { color: 'default', key: 'unknown' };
  if (status.sidecar.state === 'initialized') return { color: 'success', key: 'initialized' };
  if (status.sidecar.state === 'recovery_required') return { color: 'danger', key: 'recovery_required' };
  return { color: 'warning', key: status.sidecar.state };
}

/**
 * Fabric identity, recovery key, backups and recovery of the Matter plugin. Self-contained on purpose (it only
 * needs `/api/matter/*` and the plugin's i18n), so it can move into the Infrastructure tab (ATT-997) unchanged.
 *
 * The recovery key lives only in `reveal` state while the reveal modal is open; it is never put into the status,
 * a cache or storage, and is dropped as soon as the administrator acknowledged it.
 */
export function FabricBackupSection() {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { status, error, loading, refresh, setStatus } = useFabricBackup();
  const [reveal, setReveal] = useState<RecoveryKeyReveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [restoring, setRestoring] = useState(false);
  const [rotating, setRotating] = useState(false);

  const act = async (title: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setNotice({ title, message: messageOf(caught) });
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const showKey = (key: RecoveryKeyReveal | null) => key && setReveal(key);

  const create = () =>
    act(t('fabric.createError'), async () => {
      const result = await createFabric();
      setStatus(result.status);
      showKey(result.recoveryKey);
    });
  const generateKey = () =>
    act(t('fabric.key.generateError'), async () => {
      showKey(await generateRecoveryKey());
      await refresh();
    });
  const rotate = () =>
    act(t('fabric.key.rotateError'), async () => {
      setRotating(false);
      showKey(await rotateRecoveryKey());
      await refresh();
    });
  const backup = () =>
    act(t('fabric.backups.error'), async () => {
      await backUpNow();
      await refresh();
    });
  const download = (item: BackupView) => act(t('fabric.backups.downloadError'), () => downloadBackup(item.id));
  const acceptSidecar = () =>
    act(t('fabric.recovery.error'), async () => {
      setStatus(await acceptSidecarFabric());
    });
  const startNew = () =>
    act(t('fabric.recovery.error'), async () => {
      const result = await startNewFabric();
      setStatus(result.status);
      showKey(result.recoveryKey);
    });

  const acknowledge = async (keyId: string) => {
    setStatus(await acknowledgeRecoveryKey(keyId));
  };

  let body: React.ReactNode;
  if (loading) {
    body = <Spinner />;
  } else if (!status) {
    body = (
      <StatusAlert status="danger" title={t('fabric.loadError')} data-cy="matter-fabric-load-error">
        {error}
      </StatusAlert>
    );
  } else {
    body = (
      <FabricContent
        status={status}
        busy={busy}
        onCreate={() => void create()}
        onBackup={() => void backup()}
        onDownload={(item) => void download(item)}
        onGenerateKey={() => void generateKey()}
        onRotate={() => setRotating(true)}
        onRestore={() => setRestoring(true)}
        onAcceptSidecar={acceptSidecar}
        onStartNew={startNew}
        formatDateTime={formatDateTime}
      />
    );
  }

  return (
    <section className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-fabric-section">
      <h2 className="mt:text-lg mt:font-semibold">{t('fabric.title')}</h2>
      {body}

      {reveal && <RecoveryKeyModal reveal={reveal} onAcknowledge={acknowledge} onDone={() => setReveal(null)} />}
      {restoring && status && (
        <RestoreWizard
          stored={status.backups.stored}
          onClose={() => {
            setRestoring(false);
            void refresh();
          }}
          onRestored={setStatus}
        />
      )}
      <StatusDialog
        isOpen={rotating}
        status="warning"
        title={t('fabric.key.rotateTitle')}
        onClose={() => setRotating(false)}
        action={{
          label: t('fabric.key.rotateConfirm'),
          isPending: busy,
          onPress: rotate,
          'data-cy': 'matter-rotate-confirm',
        }}
        data-cy="matter-rotate-dialog"
      >
        {t('fabric.key.rotateText')}
      </StatusDialog>
      <StatusDialog
        isOpen={notice !== null}
        status="error"
        title={notice?.title ?? ''}
        onClose={() => setNotice(null)}
        data-cy="matter-fabric-error-dialog"
      >
        {notice?.message ?? ''}
      </StatusDialog>
    </section>
  );
}

type ContentProps = Readonly<{
  status: FabricBackupStatus;
  busy: boolean;
  onCreate: () => void;
  onBackup: () => void;
  onDownload: (item: BackupView) => void;
  onGenerateKey: () => void;
  onRotate: () => void;
  onRestore: () => void;
  onAcceptSidecar: () => Promise<void>;
  onStartNew: () => Promise<void>;
  formatDateTime: (value: string | null) => React.ReactNode;
}>;

function FabricContent(props: ContentProps) {
  const { status, busy } = props;
  const { recovery } = status;
  return (
    <>
      <StatusCard status={status} busy={busy} onCreate={props.onCreate} onRestore={props.onRestore} />
      {recovery.required && (
        <RecoveryPanel
          status={status}
          busy={busy}
          onRestore={props.onRestore}
          onAcceptSidecar={props.onAcceptSidecar}
          onStartNew={props.onStartNew}
        />
      )}

      <KeyCard {...props} />
      <BackupsCard {...props} />
    </>
  );
}

function StatusCard({
  status,
  busy,
  onCreate,
  onRestore,
}: Pick<ContentProps, 'status' | 'busy' | 'onCreate' | 'onRestore'>) {
  const { t } = useMatterTranslations();
  const chip = stateChip(status);
  const { sidecar, recovery, actions } = status;
  const canCreate =
    sidecar.reachable && sidecar.state === 'uninitialized' && !recovery.required && actions.canCreateFabric;
  return (
    <Card data-cy="matter-fabric-card">
      <Card.Header>
        <Card.Title>{t('fabric.statusTitle')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-4">
        <div className="mt:flex mt:flex-wrap mt:items-center mt:gap-2">
          <Chip color={chip.color} variant="soft" data-cy="matter-fabric-state">
            {t(`fabric.state.${chip.key}`)}
          </Chip>
        </div>
        {!sidecar.reachable && (
          <StatusAlert status="warning" title={t('fabric.unreachable')}>
            {t('fabric.unreachableText')}
          </StatusAlert>
        )}
        {recovery.required && (
          <StatusAlert status="danger" title={t('fabric.recoveryRequired')} data-cy="matter-fabric-mismatch">
            {recovery.mismatch ? t(`fabric.mismatch.${recovery.mismatch}`) : t('fabric.mismatch.unknown')}
            {sidecar.reason && (
              <span className="mt:mt-1 mt:block mt:text-sm">
                {t('fabric.reason')}:{' '}
                {STORAGE_REASONS.includes(sidecar.reason)
                  ? t(`fabric.storageReason.${sidecar.reason}`)
                  : sidecar.reason}
              </span>
            )}
          </StatusAlert>
        )}
        {!recovery.required && sidecar.state === 'uninitialized' && sidecar.reachable && (
          <p data-cy="matter-fabric-uninitialized">{t('fabric.uninitializedText')}</p>
        )}
        <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
          <Field label={t('fabric.fabricId')}>{sidecar.fabricId ?? t('fabric.none')}</Field>
          <Field label={t('fabric.generationLabel')}>{sidecar.fabricGeneration ?? t('fabric.none')}</Field>
          <Field label={t('fabric.fingerprint')}>
            {sidecar.rootCertFingerprint ? (
              <span title={sidecar.rootCertFingerprint} data-cy="matter-fabric-fingerprint">
                {shortFingerprint(sidecar.rootCertFingerprint)}
              </span>
            ) : (
              t('fabric.none')
            )}
          </Field>
          <Field label={t('fabric.storageInstance')}>{sidecar.storageInstanceId ?? t('fabric.none')}</Field>
        </dl>
        {recovery.required && status.recorded && (
          <div data-cy="matter-fabric-recorded">
            <p className="mt:mb-1 mt:text-sm mt:font-medium">{t('fabric.recorded')}</p>
            <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
              <Field label={t('fabric.fabricId')}>{status.recorded.fabricId ?? t('fabric.none')}</Field>
              <Field label={t('fabric.generationLabel')}>{status.recorded.fabricGeneration ?? t('fabric.none')}</Field>
            </dl>
          </div>
        )}
        {canCreate && (
          <div>
            <div className="mt:flex mt:flex-wrap mt:gap-2">
              <Button isPending={busy} onPress={onCreate} data-cy="matter-fabric-create">
                {t('fabric.create')}
              </Button>
              {actions.canRestore && (
                <Button variant="secondary" isDisabled={busy} onPress={onRestore} data-cy="matter-restore-open-empty">
                  {t('fabric.restore.open')}
                </Button>
              )}
            </div>
            <p className="mt:mt-1 mt:text-sm mt:text-muted">{t('fabric.createHint')}</p>
            {actions.canRestore && <p className="mt:text-sm mt:text-muted">{t('fabric.restoreInstead')}</p>}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

function KeyCard(props: ContentProps) {
  const { status, busy, formatDateTime } = props;
  const { t } = useMatterTranslations();
  const { sidecar, recovery, recoveryKey } = status;
  const initialized = sidecar.reachable && sidecar.state === 'initialized';
  return (
    <>
      {(initialized || recoveryKey.present) && (
        <Card data-cy="matter-key-card">
          <Card.Header>
            <Card.Title>{t('fabric.key.cardTitle')}</Card.Title>
          </Card.Header>
          <Card.Content className="mt:flex mt:flex-col mt:gap-3">
            {recoveryKey.present ? (
              <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-2">
                <Field label={t('fabric.key.keyId')}>{recoveryKey.keyId}</Field>
                <Field label={t('fabric.key.created')}>{formatDateTime(recoveryKey.createdAt)}</Field>
              </dl>
            ) : (
              <StatusAlert status="warning" title={t('fabric.key.missing')} data-cy="matter-key-missing">
                {t('fabric.key.missingText')}
              </StatusAlert>
            )}
            {recoveryKey.present && !recoveryKey.acknowledged && (
              <StatusAlert status="warning" title={t('fabric.key.unacknowledged')} data-cy="matter-key-unacknowledged">
                {t('fabric.key.unacknowledgedText')}
              </StatusAlert>
            )}
            {!recovery.required && (
              <div>
                {recoveryKey.present ? (
                  <Button
                    variant="secondary"
                    isDisabled={busy || !initialized}
                    onPress={props.onRotate}
                    data-cy="matter-key-rotate"
                  >
                    {t('fabric.key.rotate')}
                  </Button>
                ) : (
                  <Button isDisabled={busy || !initialized} onPress={props.onGenerateKey} data-cy="matter-key-generate">
                    {t('fabric.key.generate')}
                  </Button>
                )}
              </div>
            )}
          </Card.Content>
        </Card>
      )}
    </>
  );
}

function BackupsCard(props: ContentProps) {
  const { status, busy, formatDateTime } = props;
  const { t } = useMatterTranslations();
  const { sidecar, recovery, backups, actions } = status;
  const initialized = sidecar.reachable && sidecar.state === 'initialized';
  return (
    <>
      {(initialized || backups.stored.length > 0) && (
        <Card data-cy="matter-backups-card">
          <Card.Header>
            <Card.Title>{t('fabric.backups.title')}</Card.Title>
          </Card.Header>
          <Card.Content className="mt:flex mt:flex-col mt:gap-4">
            <dl className="mt:grid mt:grid-cols-1 mt:gap-3 mt:sm:grid-cols-3">
              <Field label={t('fabric.backups.lastSuccessful')}>
                {backups.lastSuccessfulAt ? formatDateTime(backups.lastSuccessfulAt) : t('fabric.backups.never')}
              </Field>
              <Field label={t('fabric.backups.lastAttempt')}>
                {backups.lastAttempt
                  ? `${formatDateTime(backups.lastAttempt.at)} (${t(`fabric.backups.outcome.${backups.lastAttempt.outcome}`)})`
                  : t('fabric.none')}
              </Field>
              <Field label={t('fabric.backups.nextRun')}>
                {backups.nextScheduledAt ? formatDateTime(backups.nextScheduledAt) : t('fabric.none')}
              </Field>
            </dl>
            {backups.lastAttempt?.outcome === 'failed' && (
              <StatusAlert status="danger" title={t('fabric.backups.failed')} data-cy="matter-backup-failed">
                {backups.lastAttempt.reason === null
                  ? t('fabric.backups.noReason')
                  : BACKUP_FAILURE_REASONS.includes(backups.lastAttempt.reason)
                    ? t(`fabric.backups.reason.${backups.lastAttempt.reason}`)
                    : backups.lastAttempt.reason}
              </StatusAlert>
            )}
            <div className="mt:flex mt:flex-wrap mt:gap-2">
              <Button
                isDisabled={!actions.canBackup}
                isPending={busy}
                onPress={props.onBackup}
                data-cy="matter-backup-now"
              >
                {t('fabric.backups.now')}
              </Button>
              {!recovery.required && (
                <Button
                  variant="secondary"
                  isDisabled={busy || !actions.canRestore}
                  onPress={props.onRestore}
                  data-cy="matter-restore-open"
                >
                  {t('fabric.restore.open')}
                </Button>
              )}
            </div>
            {backups.stored.length === 0 ? (
              <p className="mt:text-sm mt:text-muted" data-cy="matter-backups-empty">
                {t('fabric.backups.empty')}
              </p>
            ) : (
              <ul
                className="mt:flex mt:flex-col mt:divide-y mt:divide-separator"
                aria-label={t('fabric.backups.stored')}
              >
                {backups.stored.map((item) => (
                  <li
                    key={item.id}
                    className="mt:flex mt:flex-col mt:gap-2 mt:py-2 mt:sm:flex-row mt:sm:items-center mt:sm:justify-between"
                  >
                    <div>
                      <p>{formatDateTime(item.createdAt)}</p>
                      <p className="mt:text-xs mt:text-muted">
                        {t(`fabric.trigger.${item.trigger}`)} ·{' '}
                        {t('fabric.generation', { generation: item.fabricGeneration })} · {formatSize(item.sizeBytes)}
                      </p>
                    </div>
                    <Button
                      variant="tertiary"
                      isDisabled={busy}
                      onPress={() => props.onDownload(item)}
                      data-cy={`matter-backup-download-${item.id}`}
                    >
                      {t('fabric.backups.download')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt:text-xs mt:text-muted">{t('fabric.backups.retention', { count: backups.retention })}</p>
          </Card.Content>
        </Card>
      )}
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
