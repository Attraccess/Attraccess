import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { HealthCard } from './HealthCard';

/** Versions of the plugin, sidecar and wire protocol, and whether they are a supported combination. */
export function CompatibilityHealthCard() {
  const { t } = useMatterTranslations();
  const { status } = useMatterConnection();
  const incompatible = status?.reason === 'incompatible';
  const known = status?.sidecar != null;
  const lastKnown = status !== null && status.state !== 'connected';
  const level = incompatible ? 'danger' : status?.state === 'connected' ? 'ok' : 'unknown';
  return (
    <HealthCard
      title={t('health.compatibility.title')}
      level={level}
      levelLabel={t(
        incompatible
          ? 'health.compatibility.incompatible'
          : level === 'ok'
            ? 'health.compatibility.ok'
            : 'health.levels.unknown',
      )}
      fix={{ tab: 'infrastructure', label: t('health.fix.infrastructure') }}
      dataCy="matter-health-compatibility"
    >
      {status && known && status.sidecar ? (
        <p data-cy="matter-health-versions">
          {t(lastKnown ? 'health.compatibility.versionsLastKnown' : 'health.compatibility.versions', {
            sidecar: status.sidecar.sidecar,
            matterJs: status.sidecar.matterJs,
            wire: status.wireVersion,
          })}
        </p>
      ) : (
        <p className="mt:text-muted">{t('health.compatibility.noVersions')}</p>
      )}
    </HealthCard>
  );
}
