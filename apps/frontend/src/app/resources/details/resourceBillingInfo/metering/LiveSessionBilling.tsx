import { useMeterValueFormatter } from '../../../../../hooks/useMeterValueFormatter';
import { useCreditsFormatter } from '../../../../../hooks/useCreditsFormatter';
import { Fragment, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  useResourceMeteringServiceGetResourceMeteringLive,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { applyBillingFactor, formatDurationMs, toExactCredits } from '@attraccess/shared';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  currency: string;
  minorUnit: number;
  dlClass: string;
  valueClass: string;
}

/** Running session: meter value, meter cost so far, and an estimate of the whole bill. */
export function LiveSessionBilling({ resourceId, currency, minorUnit, dlClass, valueClass }: Props) {
  const { t } = useTranslations({ en, de });
  const formatMoney = useCreditsFormatter(minorUnit);
  const formatValue = useMeterValueFormatter();

  const { data: active } = useResourcesServiceResourceUsageGetActiveSession({ resourceId }, undefined);
  const { user } = useAuth();
  // With parallel sessions `usage` may be someone else's (when I have none), so only show my own then.
  // A redacted session (no user) only tells the viewer the resource is in use; its time and cost are not theirs to see.
  const usages = active?.usages;
  const usage =
    (active?.maxParallelSessions ?? 1) > 1
      ? (usages?.find((u) => u.userId === user?.id && u.user) ?? null)
      : active?.usage?.user
        ? active.usage
        : null;
  const { data: live } = useResourceMeteringServiceGetResourceMeteringLive({ resourceId }, undefined, {
    enabled: !!usage,
    refetchInterval: 10_000,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!usage) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [usage]);

  if (!usage) return null;

  const money = (credits: number) => t('live.billingValue', { credits: formatMoney(credits), currency });

  const elapsedMs = Math.max(0, now - new Date(usage.startTime).getTime());
  // With parallel sessions every running session has its own meter session. One that belongs to another running
  // session is expected in the list, not stale data to wait for.
  const parallel = (active?.maxParallelSessions ?? 1) > 1;
  const otherRunningIds = new Set(parallel ? (usages ?? []).filter((u) => u.id !== usage.id).map((u) => u.id) : []);
  const heldElsewhere = (session: { usageId: number } | null | undefined) =>
    !!session && otherRunningIds.has(session.usageId);
  // A machine's sessions can share a meter: the viewer's own entry is looked up by usage, `session` is only the earliest.
  const ownSession = (meter: NonNullable<typeof live>['meters'][number]) =>
    meter.sessions?.find((session) => session.usageId === usage.id) ??
    (meter.session?.usageId === usage.id ? meter.session : undefined);
  const mismatchedUsage = live?.meters.some(
    (meter) =>
      meter.session && meter.session.usageId !== usage.id && !heldElsewhere(meter.session) && !ownSession(meter),
  );
  const meters =
    live?.meters.flatMap((meter) => {
      const own = ownSession(meter);
      return own ? [{ id: meter.id, ...own }] : [];
    }) ?? [];
  // Without a meter session of its own (parallel sessions) nothing is metered for this session, so nothing is awaited.
  const awaitsCharge = (meter: (typeof meters)[number]) =>
    meter.chargeCredits == null && !(parallel && meter.sessionId === null);
  const paidRates =
    usage.meterRates?.filter((rate) => typeof rate.creditsPerUnit === 'number' && rate.creditsPerUnit > 0) ?? [];
  const waitingForMeters =
    !live ||
    mismatchedUsage ||
    meters.some((meter) => meter.creditsPerUnit > 0 && awaitsCharge(meter)) ||
    paidRates.some(
      (rate) =>
        !live.meters.some((meter) => meter.id === rate.meterId && heldElsewhere(meter.session)) &&
        !meters.some((meter) => meter.id === rate.meterId && !awaitsCharge(meter)),
    );
  let estimate: number | null = null;
  try {
    const gross =
      toExactCredits(usage.creditsPerUsage ?? 0) +
      toExactCredits(usage.sessionDurationCreditsPerMinute ?? 0) * toExactCredits(Math.ceil(elapsedMs / 60_000)) +
      meters.reduce((sum, meter) => sum + toExactCredits(meter.chargeCredits ?? 0), BigInt(0));
    if (!waitingForMeters) estimate = applyBillingFactor(gross, usage.billingFactor ?? 100).amount;
  } catch {
    // A running estimate must not crash the resource page or show an imprecise charge.
  }
  const hasBillableRates =
    (usage.creditsPerUsage ?? 0) > 0 ||
    (usage.sessionDurationCreditsPerMinute ?? 0) > 0 ||
    paidRates.length > 0 ||
    meters.some((meter) => (meter.creditsPerUnit ?? 0) > 0);

  return (
    <div className="flex flex-col gap-2" data-cy="live-session-billing">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity className="size-4" />
        {t('live.title')}
      </div>
      <dl className={dlClass}>
        <dt>{t('live.sessionTime')}</dt>
        <dd className={valueClass}>{formatDurationMs(elapsedMs)}</dd>
        {meters.map((meter) => (
          <Fragment key={meter.id}>
            <dt>{meter.meterName}</dt>
            <dd className={valueClass} data-cy="live-meter-value">
              {meter.latestValue == null
                ? meter.sessionId === null
                  ? t('live.meterUnavailable')
                  : t('live.meterWaiting')
                : meter.shared
                  ? t('live.meterShare', { value: formatValue(meter.latestValue) })
                  : formatValue(meter.latestValue)}
              {meter.shared && meter.provisional && meter.latestValue != null && (
                <small className="ml-1 text-foreground-500" data-cy="live-meter-provisional">
                  {t('live.provisional')}
                </small>
              )}
            </dd>
            <dt>{t('live.meterRate', { name: meter.meterName })}</dt>
            <dd className={valueClass} data-cy="live-meter-rate">
              {t('live.rateValue', { rate: money(meter.creditsPerUnit) })}
            </dd>
            {(meter.creditsPerUnit ?? 0) > 0 && (
              <>
                <dt>{t(meter.shared ? 'live.meterShareCost' : 'live.meterCost', { name: meter.meterName })}</dt>
                <dd className={valueClass}>{meter.chargeCredits == null ? '-' : money(meter.chargeCredits)}</dd>
              </>
            )}
          </Fragment>
        ))}
        {hasBillableRates && (
          <>
            <dt>{t('live.estimate')}</dt>
            <dd className={`${valueClass} font-semibold`} data-cy="live-bill-estimate">
              {waitingForMeters
                ? t('live.estimateWaiting')
                : estimate == null
                  ? t('live.estimateUnavailable')
                  : money(estimate)}
            </dd>
          </>
        )}
      </dl>
      {hasBillableRates && <small className="text-foreground-500">{t('live.estimateNote')}</small>}
    </div>
  );
}
