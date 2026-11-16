import { Chip } from '@heroui/react';
import { Button, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import type { SecureBootKeysStateDto } from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import de from './de.json';
import en from './en.json';

export type SecureBootKeys = SecureBootKeysStateDto;
export type KeyDialog = 'recovery' | 'backup' | 'check' | 'restore' | 'regenerate' | null;

const STATUS_COLOR = { none: 'default', 'recovery-check-pending': 'warning', ready: 'success' } as const;

/** Status chip and fingerprints of the installation's Secure Boot keys. */
export function KeyStatus({ keys }: { keys: SecureBootKeys }) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const verifiedAt = keys.recoveryKey?.verifiedAt;
  const statusLabel =
    keys.status === 'recovery-check-pending' && keys.restored
      ? t('status.restoredPending')
      : t(`status.${keys.status}`);

  return (
    <div className="flex flex-col">
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
    </div>
  );
}

interface KeyActionsProps {
  keys: SecureBootKeys;
  isCreating: boolean;
  onCreate: () => void;
  onOpen: (dialog: KeyDialog) => void;
}

/** Buttons for what the admin can do with the keys in their current state. */
export function KeyActions({ keys, isCreating, onCreate, onOpen }: KeyActionsProps) {
  const { t } = useTranslations({ en, de });
  const hasKeys = keys.status !== 'none';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!hasKeys ? (
          <Button isPending={isCreating} onPress={onCreate} data-cy="reader-security-create">
            {t('actions.create')}
          </Button>
        ) : null}
        {keys.status === 'recovery-check-pending' ? (
          <>
            <Button onPress={() => onOpen('recovery')} data-cy="reader-security-download-recovery">
              {t('actions.downloadRecovery')}
            </Button>
            <Button onPress={() => onOpen('check')} data-cy="reader-security-check-recovery">
              {t('actions.checkRecovery')}
            </Button>
          </>
        ) : null}
        {hasKeys ? (
          <Button variant="secondary" onPress={() => onOpen('backup')} data-cy="reader-security-download-backup">
            {t('actions.downloadBackup')}
          </Button>
        ) : null}
        {keys.restoreAllowed ? (
          <Button variant="secondary" onPress={() => onOpen('restore')} data-cy="reader-security-restore">
            {t('actions.restore')}
          </Button>
        ) : null}
        {hasKeys && keys.readersWithBurnedDigests === 0 ? (
          <Button variant="tertiary" onPress={() => onOpen('regenerate')} data-cy="reader-security-regenerate">
            {t('actions.regenerate')}
          </Button>
        ) : null}
      </div>
      {hasKeys && keys.readersWithBurnedDigests > 0 ? (
        <p className="text-sm text-muted">{t('locked', { count: keys.readersWithBurnedDigests })}</p>
      ) : null}
    </>
  );
}

/** What the admin has to keep safe so secured readers stay updatable. */
export function BackupHint() {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-col gap-1 text-sm text-muted" data-cy="reader-security-backup-hint">
      <strong className="text-foreground">{t('whatToBackup.title')}</strong>
      <ul className="list-disc pl-5">
        <li>{t('whatToBackup.secret')}</li>
        <li>{t('whatToBackup.database')}</li>
        <li>{t('whatToBackup.recovery')}</li>
        <li>{t('whatToBackup.signingBackup')}</li>
      </ul>
    </div>
  );
}
