import { Alert, AlertContent, AlertDescription, AlertTitle, Spinner } from '@heroui/react';
import { AlertTriangleIcon } from 'lucide-react';
import { AlertStatusIcon, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceOperatingDiagnosticsGetDataQuality } from '@attraccess/react-query-client';
import { FlatSection } from '../../../../components/flatSection';
import { OperatingTrackingNotice } from '../operating-readiness/index';
import type { DiagnosticsRange } from './diagnosticsRange';
import en from './en.json';
import de from './de.json';

interface DataQualitySectionProps {
  resourceId: number;
  range: DiagnosticsRange;
}

/** Issues the operating-timeline data has in the selected range (or a notice when tracking is not set up). */
export function DataQualitySection({ resourceId, range }: Readonly<DataQualitySectionProps>) {
  const { t } = useTranslations({ en, de });
  const { data: dataQuality, isLoading: isLoadingDataQuality } =
    useResourcesServiceResourceOperatingDiagnosticsGetDataQuality({ resourceId, ...range });

  return (
    <FlatSection icon={<AlertTriangleIcon className="w-4 h-4" />} title={t('dataQuality.title')}>
      {isLoadingDataQuality ? (
        <Spinner size="sm" />
      ) : (
        <div className="flex flex-col gap-2" data-testid="diagnostics-data-quality">
          {dataQuality?.trackingConfigured === false && (
            <OperatingTrackingNotice resourceId={resourceId} readiness="missing" />
          )}
          {(dataQuality?.issues ?? []).length === 0
            ? dataQuality?.trackingConfigured && (
                <Alert status="success">
                  <AlertStatusIcon status="success" />
                  <AlertContent>
                    <AlertDescription>{t('dataQuality.clean')}</AlertDescription>
                  </AlertContent>
                </Alert>
              )
            : (dataQuality?.issues ?? []).map((issue) => (
                <Alert key={issue.kind} status="warning" data-testid={`diagnostics-issue-${issue.kind}`}>
                  <AlertStatusIcon status="warning" />
                  <AlertContent>
                    <AlertTitle>{t(`dataQuality.kinds.${issue.kind}`)}</AlertTitle>
                    <AlertDescription>{issue.message}</AlertDescription>
                  </AlertContent>
                </Alert>
              ))}
        </div>
      )}
    </FlatSection>
  );
}
