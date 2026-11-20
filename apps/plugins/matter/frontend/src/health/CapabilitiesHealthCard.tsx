import { Chip } from '@heroui/react';
import { FEATURE_FAMILIES, familyAvailability } from '../capabilities';
import { useMatterTranslations } from '../i18n';
import { useMatterConnection } from '../MatterConnectionContext';
import { HealthCard } from './HealthCard';

/** Which feature families the connected sidecar implements. */
export function CapabilitiesHealthCard() {
  const { t } = useMatterTranslations();
  const { status } = useMatterConnection();
  const connected = status?.state === 'connected' && status.capabilities !== null;
  return (
    <HealthCard
      title={t('health.capabilities.title')}
      level={connected ? 'ok' : 'unknown'}
      levelLabel={t(connected ? 'health.capabilities.reported' : 'health.levels.unknown')}
      fix={{ tab: 'infrastructure', label: t('health.fix.infrastructure') }}
      dataCy="matter-health-capabilities"
    >
      {!connected && <p className="mt:text-muted">{t('health.capabilities.unknown')}</p>}
      <ul className="mt:flex mt:flex-wrap mt:gap-2">
        {FEATURE_FAMILIES.map((family) => {
          const availability = familyAvailability(status, family);
          return (
            <li key={family}>
              <Chip
                size="sm"
                variant="soft"
                color={availability === 'available' ? 'success' : 'default'}
                data-cy={`matter-capability-${family}`}
                data-availability={availability}
              >
                {t(`health.capabilities.family.${family}`)}: {t(`health.capabilities.state.${availability}`)}
              </Chip>
            </li>
          );
        })}
      </ul>
    </HealthCard>
  );
}
