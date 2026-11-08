import { Chip, Spinner } from '@heroui/react';
import { Button, StatusDialog, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useAttractapServiceCheckRecoveryKey,
  useAttractapServiceCreateSecureBootKeys,
  useAttractapServiceDownloadRecoveryKey,
  useAttractapServiceDownloadSigningKeyBackup,
  useAttractapServiceGetSecureBootKeys,
  useAttractapServiceGetSecureBootKeysKey,
  useAttractapServiceRestoreSecureBootKeys,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { KeyFileDialog } from './KeyFileDialog';
import { PassphraseDialog } from './PassphraseDialog';
import { saveTextFile } from './saveKeyFile';
import { useSingleFlight } from './useSingleFlight';
import de from './de.json';
import en from './en.json';

type Dialog = 'recovery' | 'backup' | 'check' | 'restore' | 'regenerate' | null;

const STATUS_COLOR = { none: 'default', 'recovery-check-pending': 'warning', ready: 'success' } as const;

/**
 * Secure Boot keys of this installation (ATT-1205): create them, prove the recovery key, back the
 * signing key up and restore. Key material only ever travels inside the passphrase-protected files the
 * admin downloads or uploads here.
 */
export function ReaderSecuritySection() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formatDateTime = useDateTimeFormatter();
  const { data: keys, isLoading, isError, refetch } = useAttractapServiceGetSecureBootKeys();
  const [dialog, setDialog] = useState<Dialog>(null);
  const once = useSingleFlight();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [useAttractapServiceGetSecureBootKeysKey] });
  const done = (title: string) => {
    toast.success({ title });
    setDialog(null);
    void refresh();
  };

  const create = useAttractapServiceCreateSecureBootKeys({
    onSuccess: () => done(t('toast.created')),
    onError: (error) => toast.error({ title: t('error'), description: apiErrorMessage(error) }),
  });
  const downloadRecovery = useAttractapServiceDownloadRecoveryKey({
    onSuccess: (file) => {
      saveTextFile('attraccess-recovery-key.pem', file.pem);
      done(t('toast.recoveryDownloaded'));
    },
  });
  const downloadBackup = useAttractapServiceDownloadSigningKeyBackup({
    onSuccess: (file) => {
      saveTextFile('attraccess-signing-key-backup.pem', file.pem);
      done(t('toast.backupDownloaded'));
    },
  });
  const check = useAttractapServiceCheckRecoveryKey({ onSuccess: () => done(t('toast.recoveryVerified')) });
  const restore = useAttractapServiceRestoreSecureBootKeys({ onSuccess: () => done(t('toast.restored')) });

  // A dialog opens clean: an error from an earlier attempt must not greet the next one.
  const openDialog = (next: Dialog) => {
    downloadRecovery.reset();
    downloadBackup.reset();
    check.reset();
    restore.reset();
    setDialog(next);
  };
  const createKeys = () => once((settle) => create.mutate(undefined, { onSettled: settle }));

  if (!keys && isError) {
    return (
      <SettingsSection title={t('title')} description={t('description')}>
        <p className="text-sm text-danger" data-cy="reader-security-load-error">
          {t('loadFailed')}
        </p>
        <div>
          <Button variant="secondary" onPress={() => void refetch()} data-cy="reader-security-retry">
            {t('retry')}
          </Button>
        </div>
      </SettingsSection>
    );
  }
  if (isLoading || !keys) return <Spinner />;

  const hasKeys = keys.status !== 'none';
  const verifiedAt = keys.recoveryKey?.verifiedAt;
  const statusLabel =
    keys.status === 'recovery-check-pending' && keys.restored
      ? t('status.restoredPending')
      : t(`status.${keys.status}`);

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <p className="rounded-lg bg-surface-secondary p-3 text-sm" data-cy="reader-security-warning">
        {t('warning')}
      </p>

      <SettingsRow
        label={t('status.label')}
        hint={verifiedAt ? t('status.verifiedAt', { date: String(formatDateTime(verifiedAt)) }) : undefined}
      >
        <Chip color={STATUS_COLOR[keys.status]} data-cy="reader-security-status">
          {statusLabel}
        </Chip>
      </SettingsRow>

      {keys.signingKey ? (
        <SettingsRow label={t('fingerprints.signing')} stacked>
          <code className="break-all text-xs">{keys.signingKey.fingerprint}</code>
        </SettingsRow>
      ) : null}
      {keys.recoveryKey ? (
        <SettingsRow label={t('fingerprints.recovery')} stacked>
          <code className="break-all text-xs">{keys.recoveryKey.fingerprint}</code>
        </SettingsRow>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!hasKeys ? (
          <Button isPending={create.isPending} onPress={createKeys} data-cy="reader-security-create">
            {t('actions.create')}
          </Button>
        ) : null}
        {keys.status === 'recovery-check-pending' ? (
          <>
            <Button onPress={() => openDialog('recovery')} data-cy="reader-security-download-recovery">
              {t('actions.downloadRecovery')}
            </Button>
            <Button onPress={() => openDialog('check')} data-cy="reader-security-check-recovery">
              {t('actions.checkRecovery')}
            </Button>
          </>
        ) : null}
        {hasKeys ? (
          <Button variant="secondary" onPress={() => openDialog('backup')} data-cy="reader-security-download-backup">
            {t('actions.downloadBackup')}
          </Button>
        ) : null}
        {keys.restoreAllowed ? (
          <Button variant="secondary" onPress={() => openDialog('restore')} data-cy="reader-security-restore">
            {t('actions.restore')}
          </Button>
        ) : null}
        {hasKeys && keys.readersWithBurnedDigests === 0 ? (
          <Button variant="tertiary" onPress={() => openDialog('regenerate')} data-cy="reader-security-regenerate">
            {t('actions.regenerate')}
          </Button>
        ) : null}
      </div>
      {hasKeys && keys.readersWithBurnedDigests > 0 ? (
        <p className="text-sm text-muted">{t('locked', { count: keys.readersWithBurnedDigests })}</p>
      ) : null}

      <div className="flex flex-col gap-1 text-sm text-muted" data-cy="reader-security-backup-hint">
        <strong className="text-foreground">{t('whatToBackup.title')}</strong>
        <ul className="list-disc pl-5">
          <li>{t('whatToBackup.secret')}</li>
          <li>{t('whatToBackup.database')}</li>
          <li>{t('whatToBackup.recovery')}</li>
        </ul>
      </div>

      <PassphraseDialog
        key={`recovery-${dialog === 'recovery'}`}
        isOpen={dialog === 'recovery'}
        kind="recovery"
        isPending={downloadRecovery.isPending}
        error={downloadRecovery.error}
        onClose={() => setDialog(null)}
        onSubmit={(passphrase) =>
          once((settle) => downloadRecovery.mutate({ requestBody: { passphrase } }, { onSettled: settle }))
        }
      />
      <PassphraseDialog
        key={`backup-${dialog === 'backup'}`}
        isOpen={dialog === 'backup'}
        kind="backup"
        isPending={downloadBackup.isPending}
        error={downloadBackup.error}
        onClose={() => setDialog(null)}
        onSubmit={(passphrase) =>
          once((settle) => downloadBackup.mutate({ requestBody: { passphrase } }, { onSettled: settle }))
        }
      />
      <KeyFileDialog
        key={`check-${dialog === 'check'}`}
        isOpen={dialog === 'check'}
        kind="check"
        isPending={check.isPending}
        error={check.error}
        onClose={() => setDialog(null)}
        onSubmit={({ pem, passphrase }) =>
          once((settle) => check.mutate({ requestBody: { pem, passphrase } }, { onSettled: settle }))
        }
      />
      <KeyFileDialog
        key={`restore-${dialog === 'restore'}`}
        isOpen={dialog === 'restore'}
        kind="restore"
        isPending={restore.isPending}
        error={restore.error}
        onClose={() => setDialog(null)}
        onSubmit={(requestBody) => once((settle) => restore.mutate({ requestBody }, { onSettled: settle }))}
      />
      <StatusDialog
        isOpen={dialog === 'regenerate'}
        status="warning"
        title={t('regenerate.title')}
        onClose={() => setDialog(null)}
        action={{
          label: t('regenerate.confirm'),
          isPending: create.isPending,
          onPress: createKeys,
          'data-cy': 'reader-security-regenerate-confirm',
        }}
      >
        {t('regenerate.description')}
      </StatusDialog>
    </SettingsSection>
  );
}
