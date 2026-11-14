import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { BackupView, FabricBackupStatus } from './api';
import { backupBlocker, restoreBlocker, type Blocker } from './blockers';
import { Field } from './Field';
import { useFormatSize } from './useFormatSize';

type Props = Readonly<{
  status: FabricBackupStatus;
  /** The action that is running (its button spins), or null. */
  pending: string | null;
  onBackup: () => void;
  onDownload: (item: BackupView) => void;
  onRestore: () => void;
  formatDateTime: (value: string | null) => React.ReactNode;
}>;

export const downloadAction = (item: BackupView) => `download:${item.id}`;

function LastFailure({ reason }: Readonly<{ reason: string | null }>) {
  const { t, tExists } = useMatterTranslations();
  const key = `fabric.backups.reason.${reason}`;
  let text = t('fabric.backups.noReason');
  if (reason) text = tExists(key) ? t(key) : reason;
  return (
    <StatusAlert status="danger" title={t('fabric.backups.failed')} data-cy="matter-backup-failed">
      {text}
    </StatusAlert>
  );
}

/** "Back up now" and "Restore from backup", each with the reason when the current state does not allow it. */
function BackupActions({ status, pending, onBackup, onRestore }: Props) {
  const { t } = useMatterTranslations();
  const backupBlocked = backupBlocker(status);
  const restoreBlocked = restoreBlocker(status);
  const hints = [...new Set([backupBlocked, status.recovery.required ? null : restoreBlocked])].filter(
    (hint): hint is Blocker => hint !== null,
  );
  return (
    <div className="mt:flex mt:flex-col mt:gap-1">
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <Button
          isDisabled={pending !== null || backupBlocked !== null}
          isPending={pending === 'backup'}
          onPress={onBackup}
          data-cy="matter-backup-now"
        >
          {t('fabric.backups.now')}
        </Button>
        {!status.recovery.required && (
          <Button
            variant="secondary"
            isDisabled={pending !== null || restoreBlocked !== null}
            onPress={onRestore}
            data-cy="matter-restore-open"
          >
            {t('fabric.restore.open')}
          </Button>
        )}
      </div>
      {hints.map((hint) => (
        <p key={hint} className="mt:text-sm mt:text-muted" data-cy={`matter-backup-blocked-${hint}`}>
          {t(`fabric.blocked.${hint}`)}
        </p>
      ))}
    </div>
  );
}

function StoredList({ status, pending, onDownload, formatDateTime }: Props) {
  const { t } = useMatterTranslations();
  const formatSize = useFormatSize();
  const { stored } = status.backups;
  if (stored.length === 0) {
    return (
      <p className="mt:text-sm mt:text-muted" data-cy="matter-backups-empty">
        {t('fabric.backups.empty')}
      </p>
    );
  }
  return (
    <ul className="mt:flex mt:flex-col mt:divide-y mt:divide-separator" aria-label={t('fabric.backups.stored')}>
      {stored.map((item) => (
        <li
          key={item.id}
          className="mt:flex mt:flex-col mt:gap-2 mt:py-2 mt:sm:flex-row mt:sm:items-center mt:sm:justify-between"
        >
          <div>
            <p>{formatDateTime(item.createdAt)}</p>
            <p className="mt:text-xs mt:text-muted">
              {t(`fabric.trigger.${item.trigger}`)} · {t('fabric.generation', { generation: item.fabricGeneration })} ·{' '}
              {formatSize(item.sizeBytes)}
              {!item.consistent && ` · ${t('fabric.backups.inconsistentMark')}`}
            </p>
          </div>
          <Button
            variant="tertiary"
            isDisabled={pending !== null}
            isPending={pending === downloadAction(item)}
            onPress={() => onDownload(item)}
            data-cy={`matter-backup-download-${item.id}`}
          >
            {t('fabric.backups.download')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Backup status (last success, last attempt, next run), the actions and the stored backups. */
export function BackupsCard(props: Props) {
  const { status, formatDateTime } = props;
  const { t } = useMatterTranslations();
  const { sidecar, backups } = status;
  const { lastAttempt } = backups;
  if (!(sidecar.reachable && sidecar.state === 'initialized') && backups.stored.length === 0) return null;
  return (
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
            {lastAttempt
              ? `${formatDateTime(lastAttempt.at)} (${t(`fabric.backups.outcome.${lastAttempt.outcome}`)})`
              : t('fabric.none')}
          </Field>
          <Field label={t('fabric.backups.nextRun')}>
            {backups.nextScheduledAt ? formatDateTime(backups.nextScheduledAt) : t('fabric.none')}
          </Field>
        </dl>
        {lastAttempt?.outcome === 'failed' && <LastFailure reason={lastAttempt.reason} />}
        <BackupActions {...props} />
        <StoredList {...props} />
        <p className="mt:text-xs mt:text-muted">{t('fabric.backups.retention', { count: backups.retention })}</p>
      </Card.Content>
    </Card>
  );
}
