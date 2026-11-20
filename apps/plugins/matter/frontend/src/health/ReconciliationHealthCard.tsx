import { DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { ReconciliationStatus } from '../devices/api';
import { reconciliationLevel } from '../healthLevel';
import { HealthCard } from './HealthCard';

/** The last reconciliation of the device records with the sidecar's inventory, and the event counters. */
export function ReconciliationHealthCard({
  data,
  error,
  loading,
}: Readonly<{ data: ReconciliationStatus | null; error: string | null; loading: boolean }>) {
  const { t } = useMatterTranslations();
  const level = reconciliationLevel(data?.lastResult);
  // Not loaded (failed): unknown. Loaded without a run yet: "No reconciliation yet".
  let levelLabel = t('health.levels.unknown');
  if (data)
    levelLabel = t(
      data.lastResult ? `devices.reconciliation.result.${data.lastResult}` : 'devices.reconciliation.never',
    );
  const counters = Object.entries(data?.events ?? {}).filter(([, count]) => count > 0);
  return (
    <HealthCard
      title={t('health.reconciliation.title')}
      level={level}
      levelLabel={levelLabel}
      fix={{ tab: 'devices', label: t('health.fix.devices') }}
      loading={loading && !data}
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
