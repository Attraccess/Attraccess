import { ReactNode, useEffect } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Skeleton } from '@heroui/react';
import { AlertStatusIcon, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceUsageStartBlocked } from '@attraccess/react-query-client';
import en from './translations/en.json';
import de from './translations/de.json';

/** Safety net next to the live events: also asks again now and then, e.g. when a booking starts while nobody sends an event. */
export const START_BLOCKED_POLL_MS = 30_000;
/** setTimeout cannot wait longer than a signed 32-bit number of milliseconds. */
const MAX_TIMER_MS = 2_147_483_647;

interface StartBlockedGateProps {
  resourceId: number;
  /** The start controls, shown while nothing blocks the start. */
  children: ReactNode;
}

/**
 * Shows the reason a plugin reports for a blocked start in place of the start controls, like the not-introduced
 * and in-use notices. Plugins answer through the generic start-blocked query; the server still checks every start,
 * so a start that slips through (or a slow refresh) ends in the usual error toast.
 */
export function StartBlockedGate({ resourceId, children }: Readonly<StartBlockedGateProps>) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter({ showDate: true, showTime: true });
  const { data, isPending, refetch } = useResourcesServiceResourceUsageStartBlocked({ resourceId }, undefined, {
    refetchInterval: START_BLOCKED_POLL_MS,
  });

  const untilMs = data?.blocked && data.until ? new Date(data.until).getTime() : null;
  useEffect(() => {
    if (untilMs === null || Number.isNaN(untilMs)) return;
    // A moment after the announced end, so the server no longer sees the block.
    const timer = setTimeout(() => void refetch(), Math.min(Math.max(untilMs - Date.now(), 0) + 1000, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [untilMs, refetch]);

  // Until the first answer is there, the start controls would flash up and vanish again when the notice follows.
  if (isPending) return <Skeleton className="h-10 w-full rounded-lg" />;
  if (!data?.blocked || !data.reason) return <>{children}</>;

  return (
    <Alert status="warning" data-cy="start-blocked-notice">
      <AlertStatusIcon status="warning" />
      <AlertContent>
        <AlertTitle>{data.reason.title}</AlertTitle>
        <AlertDescription>{data.reason.body}</AlertDescription>
        {untilMs !== null && (
          <AlertDescription className="text-sm">{t('until', { time: formatDateTime(data.until) })}</AlertDescription>
        )}
      </AlertContent>
    </Alert>
  );
}
