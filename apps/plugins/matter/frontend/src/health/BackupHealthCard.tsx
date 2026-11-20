import { DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from '../fabric-backup/api';
import { HealthCard, type HealthLevel } from './HealthCard';

/** A backup older than this counts as overdue: the daily schedule has missed at least one run. */
export const BACKUP_OVERDUE_MS = 2 * 24 * 60 * 60 * 1000;

/** Backup status: last successful backup and its age, the last attempt and the next scheduled run. */
export function BackupHealthCard({
  status,
  error,
  now = Date.now(),
}: Readonly<{ status: FabricBackupStatus | null; error: string | null; now?: number }>) {
  const { t } = useMatterTranslations();
  const { backups } = status ?? {};
  const last = backups?.lastSuccessfulAt ?? null;
  const ageDays = last ? Math.floor((now - Date.parse(last)) / (24 * 60 * 60 * 1000)) : null;
  let level: HealthLevel = 'unknown';
  let key = 'unknown';
  if (status && backups) {
    const failed = backups.lastAttempt?.outcome === 'failed';
    if (!status.recorded) [level, key] = ['unknown', 'noFabric'];
    else if (last === null) [level, key] = ['warning', 'never'];
    else if (failed) [level, key] = ['warning', 'failed'];
    else if (now - Date.parse(last) > BACKUP_OVERDUE_MS) [level, key] = ['warning', 'overdue'];
    else [level, key] = ['ok', 'ok'];
  }
  return (
    <HealthCard
      title={t('health.backup.title')}
      level={level}
      levelLabel={t(`health.backup.${key}`)}
      fix={{ tab: 'infrastructure', label: t('health.fix.infrastructure') }}
      dataCy="matter-health-backup"
    >
      {error && !status && (
        <StatusAlert status="danger" title={t('health.loadError')} data-cy="matter-health-backup-error">
          {error}
        </StatusAlert>
      )}
      {backups && (
        <>
          <p data-cy="matter-health-backup-last">
            {t('health.backup.last')}: {last ? <DateTimeDisplay date={last} /> : t('health.backup.noneYet')}
            {ageDays !== null && <> ({t('health.backup.age', { days: ageDays })})</>}
          </p>
          {backups.nextScheduledAt && (
            <p>
              {t('health.backup.next')}: <DateTimeDisplay date={backups.nextScheduledAt} />
            </p>
          )}
        </>
      )}
    </HealthCard>
  );
}
