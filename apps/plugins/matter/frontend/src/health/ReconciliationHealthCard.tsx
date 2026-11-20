import { DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { ReconciliationStatus } from '../devices/api';
import type { MatterResource } from '../useMatterResource';
import { HealthCard, type HealthLevel } from './HealthCard';

const LEVEL: Record<NonNullable<ReconciliationStatus['lastResult']>, HealthLevel> = {
  applied: 'ok',
  skipped_unavailable: 'warning',
  skipped_non_authoritative: 'warning',
  failed: 'danger',
};

/** The last reconciliation of the device records with the sidecar's inventory, and the event counters. */
export function ReconciliationHealthCard({ resource }: Readonly<{ resource: MatterResource<ReconciliationStatus> }>) {
  const { t } = useMatterTranslations();
  const { data, error } = resource;
  const level: HealthLevel = data ? (data.lastResult ? LEVEL[data.lastResult] : 'unknown') : 'unknown';
  const counters = Object.entries(data?.events ?? {}).filter(([, count]) => count > 0);
  return (
    <HealthCard
      title={t('health.reconciliation.title')}
      level={level}
      levelLabel={
        data?.lastResult ? t(`devices.reconciliation.result.${data.lastResult}`) : t('devices.reconciliation.never')
      }
      fix={{ tab: 'devices', label: t('health.fix.devices') }}
      dataCy="matter-health-reconciliation"
    >
      {error && !data && (
        <StatusAlert status="danger" title={t('health.loadError')} data-cy="matter-health-reconciliation-error">
          {error}
        </StatusAlert>
      )}
      {data?.lastFinishedAt && (
        <p>
          {t('devices.reconciliation.lastRun')}: <DateTimeDisplay date={data.lastFinishedAt} />
        </p>
      )}
      {data && (
        <p className="mt:text-muted" data-cy="matter-health-events">
          {counters.length === 0
            ? t('health.reconciliation.noEvents')
            : counters.map(([name, count]) => `${t(`health.reconciliation.events.${name}`)}: ${count}`).join(' · ')}
        </p>
      )}
    </HealthCard>
  );
}
