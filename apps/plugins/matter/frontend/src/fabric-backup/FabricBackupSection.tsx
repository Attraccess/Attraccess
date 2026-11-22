import { StatusAlert, StatusDialog, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Spinner } from '@heroui/react';
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
import { BackupsCard, downloadAction } from './BackupsCard';
import { useMatterErrorText, type ErrorKeyOf } from '../useMatterErrorText';
import { backupReasonKey, fabricErrorKey } from './errors';
import { FabricStatusCard } from './FabricStatusCard';
import { KeyCard } from './KeyCard';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { RecoveryPanel } from './RecoveryPanel';
import { RestoreWizard } from './RestoreWizard';
import { useFabricBackup } from './useFabricBackup';

type Notice = { title: string; message: string } | null;

/**
 * Fabric identity, recovery key, backups and recovery of the Matter plugin. Self-contained on purpose (it only
 * needs `/api/matter/*` and the plugin's i18n), so it can move into the Infrastructure tab (ATT-997) unchanged.
 *
 * The recovery key lives only in `reveal` state while the reveal modal is open; it is never put into the status,
 * a cache or storage, and is dropped as soon as the administrator acknowledged it.
 *
 * Shown with `matter.devices.read`. Every action, the recovery panel and the downloads need `canManage`
 * (`matter.devices.manage`) and are hidden without it.
 */
export function FabricBackupSection({ canManage }: Readonly<{ canManage: boolean }>) {
  const { t } = useMatterTranslations();
  const errorText = useMatterErrorText();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { status, error, loading, refresh, setStatus } = useFabricBackup();
  const [reveal, setReveal] = useState<RecoveryKeyReveal | null>(null);
  /** The running action: every action button is disabled meanwhile, only this one spins. */
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [restoring, setRestoring] = useState(false);

  const act = async (name: string, title: string, action: () => Promise<void>, keyOf?: ErrorKeyOf) => {
    setPending(name);
    try {
      await action();
    } catch (caught) {
      setNotice({ title, message: errorText(caught, keyOf, fabricErrorKey) });
      void refresh();
    } finally {
      setPending(null);
    }
  };

  const showKey = (key: RecoveryKeyReveal | null) => key && setReveal(key);
  const adopt = (result: { status: FabricBackupStatus; recoveryKey: RecoveryKeyReveal | null }) => {
    setStatus(result.status);
    showKey(result.recoveryKey);
  };

  const create = () => act('create', t('fabric.createError'), async () => adopt(await createFabric()));
  const generateKey = () =>
    act('generateKey', t('fabric.key.generateError'), async () => {
      showKey(await generateRecoveryKey());
      await refresh();
    });
  const rotate = () =>
    act('rotate', t('fabric.key.rotateError'), async () => {
      showKey(await rotateRecoveryKey());
      // The confirmation closes as the reveal opens; the status catches up behind it.
      void refresh();
    });
  const backup = () =>
    act(
      'backup',
      t('fabric.backups.error'),
      async () => {
        await backUpNow();
        await refresh();
      },
      backupReasonKey,
    );
  const download = (item: BackupView) =>
    act(downloadAction(item), t('fabric.backups.downloadError'), () => downloadBackup(item.id));
  const acceptSidecar = () =>
    act('accept', t('fabric.recovery.error'), async () => setStatus(await acceptSidecarFabric()));
  const startNew = () => act('startNew', t('fabric.recovery.error'), async () => adopt(await startNewFabric()));

  const acknowledge = async (keyId: string) => {
    setStatus(await acknowledgeRecoveryKey(keyId));
  };

  let body: React.ReactNode;
  if (loading) {
    body = <Spinner aria-label={t('fabric.loading')} />;
  } else if (status) {
    const busy = pending !== null;
    const openRestore = () => setRestoring(true);
    body = (
      <>
        <FabricStatusCard
          status={status}
          busy={busy}
          creating={pending === 'create'}
          canManage={canManage}
          onCreate={() => void create()}
          onRestore={openRestore}
        />
        {canManage && status.recovery.required && (
          <RecoveryPanel
            status={status}
            pending={pending}
            onRestore={openRestore}
            onAcceptSidecar={acceptSidecar}
            onStartNew={startNew}
          />
        )}
        <KeyCard
          status={status}
          busy={busy}
          generating={pending === 'generateKey'}
          rotating={pending === 'rotate'}
          canManage={canManage}
          onGenerateKey={() => void generateKey()}
          onRotate={rotate}
          formatDateTime={formatDateTime}
        />
        <BackupsCard
          status={status}
          pending={pending}
          onBackup={() => void backup()}
          onDownload={(item) => void download(item)}
          onRestore={openRestore}
          canManage={canManage}
          formatDateTime={formatDateTime}
        />
      </>
    );
  } else {
    body = (
      <StatusAlert status="danger" title={t('fabric.loadError')} data-cy="matter-fabric-load-error">
        {error}
      </StatusAlert>
    );
  }

  return (
    <section className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-fabric-section">
      <h2 className="mt:text-lg mt:font-semibold">{t('fabric.title')}</h2>
      {body}

      {reveal && <RecoveryKeyModal reveal={reveal} onAcknowledge={acknowledge} onDone={() => setReveal(null)} />}
      {canManage && restoring && status && (
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
