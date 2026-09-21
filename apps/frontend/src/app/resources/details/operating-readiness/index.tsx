import { Alert, AlertContent, AlertDescription, AlertTitle, Chip, Link } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceOperatingDiagnosticsGetDataQuality } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { useOperatingDuration } from '../../operatingDuration';
import en from './en.json';
import de from './de.json';

export type OperatingTrackingReadiness = 'missing' | 'waiting' | 'unavailable' | 'available' | 'unknown';

export function operatingTrackingReadiness(
  operatingDataAvailable: boolean | undefined,
  trackingConfigured: boolean | undefined,
): OperatingTrackingReadiness {
  if (trackingConfigured === false) return 'missing';
  if (operatingDataAvailable === false) return trackingConfigured ? 'waiting' : 'unavailable';
  return operatingDataAvailable === true ? 'available' : 'unknown';
}

export function useOperatingTrackingReadinessFromSummary(
  resourceId: number,
  enabled: boolean,
  operatingDataAvailable: boolean | undefined,
) {
  const { hasPermission } = useAuth();
  const canConfigure = hasPermission('resources.update');
  const { data: quality } = useResourcesServiceResourceOperatingDiagnosticsGetDataQuality({ resourceId }, undefined, {
    enabled: enabled && canConfigure,
  });
  return operatingTrackingReadiness(operatingDataAvailable, canConfigure ? quality?.trackingConfigured : undefined);
}

export function useOperatingTrackingReadiness(resourceId: number, enabled: boolean) {
  const { data: summary } = useOperatingDuration(resourceId, enabled);
  return useOperatingTrackingReadinessFromSummary(resourceId, enabled, summary?.operatingDataAvailable);
}

export function OperatingTrackingStatus({ readiness }: { readiness: OperatingTrackingReadiness }) {
  const { t } = useTranslations({ en, de });
  return (
    <Chip size="sm" color={readiness === 'available' ? 'default' : 'warning'}>
      {t(`status.${readiness}`)}
    </Chip>
  );
}

export function OperatingTrackingNotice({
  resourceId,
  readiness,
  schedule = false,
}: {
  resourceId: number;
  readiness: OperatingTrackingReadiness;
  schedule?: boolean;
}) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  if (readiness === 'available' || readiness === 'unknown') return null;
  return (
    <Alert status="warning">
      <AlertContent>
        <AlertTitle>{t(`status.${readiness}`)}</AlertTitle>
        <AlertDescription>{t(`description.${readiness}`)}</AlertDescription>
        {schedule && <AlertDescription>{t('schedule')}</AlertDescription>}
        {hasPermission('resources.update') && <Link href={`/resources/${resourceId}/flows`}>{t('setup')}</Link>}
      </AlertContent>
    </Alert>
  );
}
