// Admin diagnostics surface over the machine operating timeline (ATT-1024):
// current state, transition history, unattributed operation, data quality and verification.
// FEATURE: ATT-1024 operating-timeline diagnostics tab
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Chip, Spinner } from '@heroui/react';
import { AlertTriangleIcon, CheckCircle2Icon, ShieldCheckIcon } from 'lucide-react';
import { formatDurationMs } from '@attraccess/shared';
import { Button } from '../../../../components/button';
import { FlatSection } from '../../../../components/flatSection';
import { Select } from '../../../../components/select';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { OperatingTrackingNotice } from '../operating-readiness';
import { RANGE_OPTIONS } from './ResourceDiagnosticsTab.state';
import { formatDuration } from './ResourceDiagnosticsTab.helpers';
import { OperatingStateSection } from './ResourceDiagnosticsTab.helpers';
import { useResourceDiagnosticsTabState } from './useResourceDiagnosticsTabState';
import { ResourceDiagnosticsTabFlatSection } from './ResourceDiagnosticsTabFlatSection';

export function ResourceDiagnosticsTab() {
  const {
    resourceId,
    t,
    rangeDays,
    setRangeDays,
    page,
    setPage,
    setVerificationRequested,
    state,
    isLoadingState,
    transitions,
    isLoadingTransitions,
    unattributed,
    isLoadingUnattributed,
    dataQuality,
    isLoadingDataQuality,
    verification,
    isVerifying,
    runVerification,
    totalPages,
    attributedMs,
  } = useResourceDiagnosticsTabState();

  return (
    <div className="flex flex-col gap-4 pb-8" data-testid="resource-diagnostics-tab">
      <OperatingStateSection state={state} isLoadingState={isLoadingState} />

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

      <FlatSection
        icon={<ShieldCheckIcon className="w-4 h-4" />}
        title={t('unattributed.title')}
        actions={
          <Select
            aria-label={t('unattributed.rangeLabel')}
            className="w-44"
            value={rangeDays}
            onChange={(key) => {
              setRangeDays(key);
              setVerificationRequested(false);
            }}
            items={RANGE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
            data-cy="diagnostics-range-select"
          />
        }
      >
        {isLoadingUnattributed ? (
          <Spinner size="sm" />
        ) : !unattributed?.operatingDataAvailable ? (
          <p className="text-sm text-muted" data-testid="diagnostics-unattributed-unavailable">
            {t('unattributed.noData')}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <Card variant="secondary" className="min-w-36 p-3">
              <p className="text-xs text-muted">{t('unattributed.operating')}</p>
              <p className="text-lg font-semibold" data-testid="diagnostics-operating-duration">
                {formatDuration(unattributed.operatingDurationMs, t('unattributed.unavailable'))}
              </p>
            </Card>
            <Card variant="secondary" className="min-w-36 p-3">
              <p className="text-xs text-muted">{t('unattributed.attributed')}</p>
              <p className="text-lg font-semibold" data-testid="diagnostics-attributed-duration">
                {formatDuration(attributedMs, t('unattributed.unavailable'))}
              </p>
            </Card>
            <Card variant="secondary" className="min-w-36 p-3">
              <p className="text-xs text-muted">{t('unattributed.unattributed')}</p>
              <p className="text-lg font-semibold" data-testid="diagnostics-unattributed-duration">
                {formatDuration(unattributed.unattributedOperatingDurationMs, t('unattributed.unavailable'))}
              </p>
            </Card>
            {unattributed.isProvisional && (
              <Chip size="sm" color="warning">
                {t('unattributed.provisional')}
              </Chip>
            )}
          </div>
        )}
      </FlatSection>

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

      <ResourceDiagnosticsTabFlatSection {...{ t, isLoadingTransitions, transitions, page, totalPages, setPage }} />
    </div>
  );
}

export default ResourceDiagnosticsTab;
