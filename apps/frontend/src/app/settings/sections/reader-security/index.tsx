import { Spinner } from '@heroui/react';
import { Button, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useCheckRecoveryKey,
  useCreateSecureBootKeys,
  useDownloadRecoveryKey,
  useDownloadSigningKeyBackup,
  useGetSecureBootKeys,
  useGetSecureBootKeysKey,
  useRestoreSecureBootKeys,
  useGetLicenseInformation,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import { triggerDownload } from '../../../../utils/download';
import { apiErrorMessage } from '../../../attractap/pairing/pairingUtils';
import { SettingsSection } from '../../components/SettingsSection';
import { BackupHint, KeyActions, KeyStatus, type KeyDialog } from './KeyOverview';
import { KeyFileDialog } from './KeyFileDialog';
import { PassphraseDialog } from './PassphraseDialog';
import { useSingleFlight } from './useSingleFlight';
import de from './de.json';
import en from './en.json';

/**
 * Secure Boot keys of this installation (ATT-1205): create them, prove the recovery key, back the
 * signing key up and restore. Key material only ever travels inside the passphrase-protected files the
 * admin downloads or uploads here.
 */
export function ReaderSecuritySection() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: license } = useGetLicenseInformation();
  const { data: keys, isLoading, isError, refetch } = useGetSecureBootKeys();
  const [dialog, setDialog] = useState<KeyDialog>(null);
  const once = useSingleFlight();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [useGetSecureBootKeysKey] });
  const done = (title: string) => {
    toast.success({ title });
    setDialog(null);
    void refresh();
  };

  const create = useCreateSecureBootKeys(undefined, {
    onSuccess: () => done(t('toast.created')),
    onError: (error) => toast.error({ title: t('error'), description: apiErrorMessage(error) }),
  });
  const downloadRecovery = useDownloadRecoveryKey(undefined, {
    onSuccess: (file) => {
      triggerDownload(file.pem, 'attraccess-recovery-key.pem', 'application/x-pem-file');
      done(t('toast.recoveryDownloaded'));
    },
  });
  const downloadBackup = useDownloadSigningKeyBackup(undefined, {
    onSuccess: (file) => {
      triggerDownload(file.pem, 'attraccess-signing-key-backup.pem', 'application/x-pem-file');
      done(t('toast.backupDownloaded'));
    },
  });
  const check = useCheckRecoveryKey(undefined, { onSuccess: () => done(t('toast.recoveryVerified')) });
  const restore = useRestoreSecureBootKeys(undefined, { onSuccess: () => done(t('toast.restored')) });

  // A dialog opens clean: an error from an earlier attempt must not greet the next one.
  const openDialog = (next: KeyDialog) => {
    downloadRecovery.reset();
    downloadBackup.reset();
    check.reset();
    restore.reset();
    setDialog(next);
  };
  const createKeys = () => once(() => create.mutateAsync(undefined));

  // Every key endpoint is licensed; without the module each call fails and the page would only offer a
  // retry that can never succeed.
  if (license && !license.modules.includes('attractap')) {
    return (
      <SettingsSection title={t('title')} description={t('description')}>
        <p className="text-sm text-muted" data-cy="reader-security-not-licensed">
          {t('notLicensed')}
        </p>
      </SettingsSection>
    );
  }
  if (!keys && isError) {
    return (
      <SettingsSection title={t('title')} description={t('description')}>
        <StatusAlert status="danger" data-cy="reader-security-load-error">
          {t('loadFailed')}
        </StatusAlert>
        <div>
          <Button variant="secondary" onPress={() => void refetch()} data-cy="reader-security-retry">
            {t('retry')}
          </Button>
        </div>
      </SettingsSection>
    );
  }
  if (isLoading || !keys) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  const hasKeys = keys.status !== 'none';

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <StatusAlert status="warning" data-cy="reader-security-warning">
        {t('warning')}
      </StatusAlert>
      <KeyStatus keys={keys} />
      <KeyActions
        keys={keys}
        isCreating={create.isPending}
        onCreate={createKeys}
        onOpen={openDialog}
        // The confirmation's own pending state blocks a second press, so no single-flight guard here.
        onRegenerate={() => create.mutateAsync(undefined)}
      />
      <BackupHint />

      <PassphraseDialog
        key={`recovery-${dialog === 'recovery'}`}
        isOpen={dialog === 'recovery'}
        kind="recovery"
        isPending={downloadRecovery.isPending}
        error={downloadRecovery.error}
        onClose={() => setDialog(null)}
        onSubmit={(passphrase) => once(() => downloadRecovery.mutateAsync({ body: { passphrase } }))}
      />
      <PassphraseDialog
        key={`backup-${dialog === 'backup'}`}
        isOpen={dialog === 'backup'}
        kind="backup"
        isPending={downloadBackup.isPending}
        error={downloadBackup.error}
        onClose={() => setDialog(null)}
        onSubmit={(passphrase) => once(() => downloadBackup.mutateAsync({ body: { passphrase } }))}
      />
      <KeyFileDialog
        key={`check-${dialog === 'check'}`}
        isOpen={dialog === 'check'}
        kind="check"
        isPending={check.isPending}
        error={check.error}
        onClose={() => setDialog(null)}
        onSubmit={({ pem, passphrase }) => once(() => check.mutateAsync({ body: { pem, passphrase } }))}
      />
      <KeyFileDialog
        key={`restore-${dialog === 'restore'}`}
        isOpen={dialog === 'restore'}
        kind="restore"
        replacesKeys={hasKeys}
        isPending={restore.isPending}
        error={restore.error}
        onClose={() => setDialog(null)}
        onSubmit={(requestBody) => once(() => restore.mutateAsync({ body: requestBody }))}
      />
    </SettingsSection>
  );
}
