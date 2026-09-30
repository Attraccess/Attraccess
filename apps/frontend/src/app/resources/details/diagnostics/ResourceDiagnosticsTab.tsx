// Admin diagnostics surface over the machine operating timeline (ATT-1024):
// current state, transition history, unattributed operation, data quality and verification.
// FEATURE: ATT-1024 operating-timeline diagnostics tab
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription, AlertTitle, Card, Chip, Spinner, Table } from '@heroui/react';
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  type OperatingStateDto,
  useResourcesServiceResourceOperatingDiagnosticsGetDataQuality,
  useResourcesServiceResourceOperatingDiagnosticsGetState,
  useResourcesServiceResourceOperatingDiagnosticsGetTransitions,
  useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline,
} from '@attraccess/react-query-client';
import { formatDurationMs } from '@attraccess/shared';
import { useOperatingDuration } from '../../operatingDuration';
import { Button } from '../../../../components/button';
import { FlatSection } from '../../../../components/flatSection';
import { Select } from '../../../../components/select';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { OperatingTrackingNotice } from '../operating-readiness';
import en from './en.json';
import de from './de.json';

const PAGE_LIMIT = 10;
const RANGE_OPTIONS = [
  { key: '7', labelKey: 'unattributed.ranges.7' },
  { key: '30', labelKey: 'unattributed.ranges.30' },
  { key: '90', labelKey: 'unattributed.ranges.90' },
] as const;

function rangeToBounds(days: string): { from: string; to: string; start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - Number(days) * 24 * 60 * 60_000);
  return { from: start.toISOString(), to: end.toISOString(), start, end };
}

/** null means "operating data unavailable" (ATT-1027 semantics) — never render it as 0. */
function formatDuration(durationMs: number | null | undefined, unavailable: string): string {
  return durationMs === null || durationMs === undefined ? unavailable : formatDurationMs(durationMs);
}

export function ResourceDiagnosticsTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);
  const { t } = useTranslations({ en, de });

  const [rangeDays, setRangeDays] = useState<string>('30');
  const [page, setPage] = useState(1);
  const [verificationRequested, setVerificationRequested] = useState(false);

  const range = useMemo(() => rangeToBounds(rangeDays), [rangeDays]);

  const { data: state, isLoading: isLoadingState } = useResourcesServiceResourceOperatingDiagnosticsGetState({
    resourceId,
  });
  const { data: transitions, isLoading: isLoadingTransitions } =
    useResourcesServiceResourceOperatingDiagnosticsGetTransitions({ resourceId, page, limit: PAGE_LIMIT });
  // Unattributed summary rides the shared operating-attribution endpoint (ATT-1025/ATT-1027) —
  // the single derivation path — instead of a diagnostics-only duplicate.
  const { data: unattributed, isLoading: isLoadingUnattributed } = useOperatingDuration(resourceId, true, {
    start: range.start,
    end: range.end,
  });
  const { data: dataQuality, isLoading: isLoadingDataQuality } =
    useResourcesServiceResourceOperatingDiagnosticsGetDataQuality({ resourceId, ...range });
  const {
    data: verification,
    isFetching: isVerifying,
    refetch: runVerification,
  } = useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline({ resourceId, ...range }, undefined, {
    enabled: verificationRequested,
  });

  const totalPages = Math.max(1, Math.ceil((transitions?.totalIntervals ?? 0) / PAGE_LIMIT));

  // The shared attribution summary reports operating and unattributed; attributed is the remainder.
  const attributedMs =
    unattributed &&
    unattributed.operatingDataAvailable &&
    unattributed.operatingDurationMs !== null &&
    unattributed.unattributedOperatingDurationMs !== null
      ? unattributed.operatingDurationMs - unattributed.unattributedOperatingDurationMs
      : null;

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

      <FlatSection icon={<ActivityIcon className="w-4 h-4" />} title={t('transitions.title')}>
        {isLoadingTransitions ? (
          <Spinner size="sm" />
        ) : (transitions?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t('transitions.empty')}</p>
        ) : (
          <div className="flex flex-col gap-3" data-testid="diagnostics-transitions">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label={t('transitions.title')}>
                  <Table.Header>
                    <Table.Column isRowHeader>{t('transitions.columns.timestamp')}</Table.Column>
                    <Table.Column>{t('transitions.columns.state')}</Table.Column>
                    <Table.Column>{t('transitions.columns.source')}</Table.Column>
                    <Table.Column>{t('transitions.columns.interval')}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {(transitions?.items ?? []).map((transition) => (
                      <Table.Row
                        key={`${transition.intervalId}-${transition.state}-${transition.timestamp}`}
                        id={`${transition.intervalId}-${transition.state}`}
                        textValue={transition.state}
                      >
                        <Table.Cell>
                          <DateTimeDisplay date={new Date(transition.timestamp)} />
                        </Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" color={transition.state === 'operating' ? 'success' : 'default'}>
                            {transition.state === 'operating' ? t('state.operating') : t('state.idle')}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-sm">{t('transitions.sourceFlowSignal')}</Table.Cell>
                        <Table.Cell className="text-sm text-muted">#{transition.intervalId}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {t('transitions.page')
                  .replace('{page}', `${page}/${totalPages}`)
                  .replace('{total}', String(transitions?.totalIntervals ?? 0))}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={page <= 1}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label={t('transitions.previous')}
                >
                  <ChevronLeftIcon size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isDisabled={page >= totalPages}
                  onPress={() => setPage((current) => current + 1)}
                  aria-label={t('transitions.next')}
                >
                  <ChevronRightIcon size={16} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </FlatSection>
    </div>
  );
}

export default ResourceDiagnosticsTab;

function OperatingStateSection({
  state,
  isLoadingState,
}: {
  state: OperatingStateDto | undefined;
  isLoadingState: boolean;
}) {
  const { t } = useTranslations({ en, de });
  return (
    <FlatSection icon={<ActivityIcon className="w-4 h-4" />} title={t('state.title')}>
      {isLoadingState ? (
        <Spinner size="sm" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Chip
            size="sm"
            color={state?.state === 'operating' ? 'success' : 'default'}
            data-testid="diagnostics-state-chip"
          >
            {state?.state === 'operating' ? t('state.operating') : t('state.idle')}
          </Chip>
          {state?.openInterval && (
            <span className="text-sm text-muted">
              {t('state.openSince')}: <DateTimeDisplay date={new Date(state.openInterval.startTime)} />
            </span>
          )}
          <span className="text-sm text-muted">
            {state?.lastTransitionAt ? (
              <>
                {t('state.lastTransition')}: <DateTimeDisplay date={new Date(state.lastTransitionAt)} />
              </>
            ) : (
              t('state.never')
            )}
          </span>
        </div>
      )}
    </FlatSection>
  );
}
