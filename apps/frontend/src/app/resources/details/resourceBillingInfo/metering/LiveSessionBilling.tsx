import { useMeterValueFormatter } from '../../meters/useMeterValueFormatter';
import { Fragment, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  useResourceMeteringServiceGetResourceMeteringLive,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency, formatDurationMs } from '@attraccess/shared';
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
  const formatNumber = useNumberFormatter();
  const formatValue = useMeterValueFormatter();

  const { data: active } = useResourcesServiceResourceUsageGetActiveSession({ resourceId }, undefined);
  const usage = active?.usage ?? null;
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

  const money = (credits: number) =>
    t('live.billingValue', { credits: formatNumber(dbCurrencyToUserCurrency(credits, minorUnit)), currency });

  const elapsedMs = Math.max(0, now - new Date(usage.startTime).getTime());
  const meters = live?.meters.filter((meter) => meter.session != null) ?? [];
  const meterCredits = meters.reduce((sum, meter) => sum + (meter.session?.chargeCredits ?? 0), 0);
  const gross =
    (usage.creditsPerUsage ?? 0) +
    (usage.sessionDurationCreditsPerMinute ?? 0) * Math.ceil(elapsedMs / 60_000) +
    meterCredits;
  const estimate = Math.round((gross * (usage.billingFactor ?? 100)) / 100);
  const hasBillableRates = gross > 0 || meters.some((meter) => (meter.session?.creditsPerUnit ?? 0) > 0);

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
            <dt>{meter.name}</dt>
            <dd className={valueClass} data-cy="live-meter-value">
              {meter.session?.latestValue == null ? t('live.meterWaiting') : formatValue(meter.session.latestValue)}
            </dd>
            {(meter.session?.creditsPerUnit ?? 0) > 0 && (
              <>
                <dt>{t('live.meterCost', { name: meter.name })}</dt>
                <dd className={valueClass}>
                  {meter.session?.chargeCredits == null ? '-' : money(meter.session.chargeCredits)}
                </dd>
              </>
            )}
          </Fragment>
        ))}
        {hasBillableRates && (
          <>
            <dt>{t('live.estimate')}</dt>
            <dd className={`${valueClass} font-semibold`}>{money(estimate)}</dd>
          </>
        )}
      </dl>
      {hasBillableRates && <small className="text-foreground-500">{t('live.estimateNote')}</small>}
    </div>
  );
}
