import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceResourceOperatingDiagnosticsGetDataQuality,
  useResourcesServiceResourceOperatingDiagnosticsGetState,
  useResourcesServiceResourceOperatingDiagnosticsGetTransitions,
  useResourcesServiceResourceOperatingDiagnosticsVerifyTimeline,
} from '@attraccess/react-query-client';
import { useOperatingDuration } from '../../operatingDuration';
import en from './en.json';
import de from './de.json';
import { PAGE_LIMIT } from './ResourceDiagnosticsTab.state';
import { rangeToBounds } from './ResourceDiagnosticsTab.helpers';

export function useResourceDiagnosticsTabState() {
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
  return {
    id,
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
  } as const;
}
