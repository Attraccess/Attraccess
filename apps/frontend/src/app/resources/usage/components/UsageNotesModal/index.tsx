import { useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useBillingServiceGetUsageBillingTransaction,
  useResourcesServiceResourceUsageGetSession,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { TransactionDetailsModal } from '../../../../billing/dashboard/summary/transactionDetailsModal';
import { UsageNotesDrawer } from './drawer';
import { useUsageSessionProject } from '../../hooks/useUsageSessionProject';
import {
  attributedOperatingDurationForUsage,
  useCanViewOperatingDuration,
  useOperatingDuration,
} from '../../../operatingDuration';
import en from './translations/en';
import de from './translations/de';

export interface UsageNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: number;
  usageId: number | null;
  onOpenBilling?: () => void;
}

export function UsageNotesModal(props: UsageNotesModalProps) {
  return props.isOpen && props.usageId !== null ? (
    <OpenUsageNotesModal key={props.usageId} {...props} usageId={props.usageId} />
  ) : null;
}

function OpenUsageNotesModal({
  resourceId,
  usageId,
  onClose,
  onOpenBilling,
}: UsageNotesModalProps & { usageId: number }) {
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const { data: session, error, refetch } = useResourcesServiceResourceUsageGetSession({ resourceId, usageId });
  const {
    data: billing,
    error: billingError,
    refetch: refetchBilling,
    isFetching: isFetchingBilling,
  } = useBillingServiceGetUsageBillingTransaction({ usageId }, undefined, {
    enabled: !!user && session?.userId === user.id,
  });
  const { resolveProjectId, updatingSessionIds, handleProjectChange } = useUsageSessionProject(resourceId);
  const canViewOperatingDuration = useCanViewOperatingDuration(resourceId);
  const range = useMemo(
    () => (session?.endTime ? { start: new Date(session.startTime), end: new Date(session.endTime) } : undefined),
    [session],
  );
  // Cancelled recovery candidates have an empty interval and no inferred operating duration.
  const isZeroDuration = !!range && range.start.getTime() === range.end.getTime();
  const {
    data: operatingDuration,
    error: operatingDurationError,
    refetch: refetchOperatingDuration,
    isFetching: isFetchingOperatingDuration,
  } = useOperatingDuration(resourceId, canViewOperatingDuration && !!session && !isZeroDuration, range);
  const relatedTransactionId = session?.userId === user?.id ? billing?.transactionId : null;

  return (
    <>
      <UsageNotesDrawer
        isOpen
        onClose={onClose}
        session={session ?? null}
        error={!!error}
        onRetry={() => refetch()}
        billingError={session?.userId === user?.id && !!billingError}
        onRetryBilling={() => refetchBilling()}
        isRetryingBilling={isFetchingBilling}
        operatingDurationError={canViewOperatingDuration && !isZeroDuration && !!operatingDurationError}
        onRetryOperatingDuration={() => refetchOperatingDuration()}
        isRetryingOperatingDuration={isFetchingOperatingDuration}
        projectLabel={t('projectSelectLabel')}
        projectPlaceholder={t('unassignedProject')}
        resolveProjectId={resolveProjectId}
        updatingSessionIds={updatingSessionIds}
        onProjectChange={handleProjectChange}
        operatingDurationMs={
          canViewOperatingDuration
            ? isZeroDuration
              ? 0
              : attributedOperatingDurationForUsage(operatingDuration, usageId)
            : undefined
        }
        onOpenBilling={
          relatedTransactionId != null ? (onOpenBilling ?? (() => setTransactionId(relatedTransactionId))) : undefined
        }
      />
      {transactionId !== null && (
        <TransactionDetailsModal transactionId={transactionId} isOpen onClose={() => setTransactionId(null)} />
      )}
    </>
  );
}
