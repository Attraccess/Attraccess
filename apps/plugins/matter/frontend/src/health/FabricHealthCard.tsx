import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { FabricBackupStatus } from '../fabric-backup/api';
import { HealthCard, type HealthLevel } from './HealthCard';

/** The fabric: whether the sidecar has one, and whether the plugin and the sidecar agree on it (recovery). */
export function FabricHealthCard({
  status,
  error,
  loading = false,
}: Readonly<{ status: FabricBackupStatus | null; error: string | null; loading?: boolean }>) {
  const { t } = useMatterTranslations();
  let level: HealthLevel = 'unknown';
  let key = 'unknown';
  if (status) {
    if (status.recovery.required) [level, key] = ['danger', 'recovery'];
    else if (!status.sidecar.reachable) [level, key] = ['unknown', 'unreachable'];
    else if (status.sidecar.state === 'uninitialized') [level, key] = ['warning', 'uninitialized'];
    else if (status.sidecar.state === 'initialized') [level, key] = ['ok', 'ok'];
  }
  return (
    <HealthCard
      title={t('health.fabric.title')}
      level={level}
      levelLabel={t(`health.fabric.${key}`)}
      fix={{ tab: 'infrastructure', label: t('health.fix.infrastructure') }}
      loading={loading && !status}
      dataCy="matter-health-fabric"
    >
      {error && !status && (
        <StatusAlert status="danger" title={t('health.loadError')} data-cy="matter-health-fabric-error">
          {error}
        </StatusAlert>
      )}
      {status && <p>{t(`health.fabric.text.${key}`)}</p>}
    </HealthCard>
  );
}
