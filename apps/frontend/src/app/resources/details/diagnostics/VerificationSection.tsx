import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { AlertTriangleIcon, CheckCircle2Icon, ShieldCheckIcon } from 'lucide-react';
import { formatDurationMs } from '@attraccess/shared';
import { AlertStatusIcon, Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline } from '@attraccess/react-query-client';
import { useState } from 'react';
import { FlatSection } from '../../../../components/flatSection';
import type { DiagnosticsRange } from './diagnosticsRange';
import { formatDuration } from './formatDuration';
import en from './en.json';
import de from './de.json';

interface VerificationSectionProps {
  resourceId: number;
  range: DiagnosticsRange;
}

/** Recomputes the operating timeline on demand and compares it with the reported value. Mount it per range. */
export function VerificationSection({ resourceId, range }: Readonly<VerificationSectionProps>) {
  const { t } = useTranslations({ en, de });
  const [verificationRequested, setVerificationRequested] = useState(false);
  const {
    data: verification,
    isFetching: isVerifying,
    refetch: runVerification,
  } = useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline({ resourceId, ...range }, undefined, {
    enabled: verificationRequested,
  });

  return (
    <FlatSection icon={<ShieldCheckIcon className="w-4 h-4" />} title={t('verification.title')}>
      <div className="flex flex-col gap-3" data-testid="diagnostics-verification">
        <p className="text-sm text-muted">{t('verification.description')}</p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            isPending={isVerifying}
            onPress={() => {
              setVerificationRequested(true);
              void runVerification();
            }}
            data-testid="diagnostics-run-verification"
          >
            <ShieldCheckIcon size={16} />
            {isVerifying ? t('verification.running') : t('verification.run')}
          </Button>
        </div>
        {verification && (
          <div className="flex flex-col gap-2">
            <Alert status={verification.consistent ? 'success' : 'danger'}>
              <AlertStatusIcon status={verification.consistent ? 'success' : 'danger'} />
              <AlertContent>
                <AlertTitle>
                  {verification.consistent ? t('verification.consistent') : t('verification.inconsistent')}
                </AlertTitle>
                <AlertDescription>
                  {t('verification.recomputed')}: {formatDurationMs(verification.recomputedOperatingDurationMs)} ·{' '}
                  {t('verification.reported')}:{' '}
                  {formatDuration(verification.reportedOperatingDurationMs, t('verification.unavailable'))} ·{' '}
                  {t('verification.intervalCount')}: {verification.intervalCount}
                </AlertDescription>
              </AlertContent>
            </Alert>
            <ul className="flex flex-col gap-1 text-sm">
              {verification.checks.map((check) => (
                <li
                  key={check.name}
                  className="flex items-center gap-2"
                  data-testid={`diagnostics-check-${check.name}`}
                >
                  {check.passed ? (
                    <CheckCircle2Icon size={14} className="text-success" />
                  ) : (
                    <AlertTriangleIcon size={14} className="text-warning" />
                  )}
                  <span>{t(`verification.checks.${check.name}`)}</span>
                  {check.detail && <span className="text-xs text-muted">{check.detail}</span>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t('verification.noAggregates')}</p>
          </div>
        )}
      </div>
    </FlatSection>
  );
}
