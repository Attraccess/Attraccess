import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  useResourceMeteringServiceGetResourceMeteringLive,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { dbCurrencyToUserCurrency, formatDurationMs } from '@attraccess/shared';
import de from './de.json';
import en from './en.json';

const KWH_FORMAT = { maximumFractionDigits: 3 } as const;

interface Props {
  resourceId: number;
  currency: string;
  minorUnit: number;
  dlClass: string;
  valueClass: string;
}

/** Running session: meter value, energy cost so far, and an estimate of the whole bill. */
export function LiveSessionBilling({ resourceId, currency, minorUnit, dlClass, valueClass }: Props) {
  const { t } = useTranslations({ en, de });
  const formatNumber = useNumberFormatter();
  const formatKwh = useNumberFormatter(KWH_FORMAT);

  const { data: active } = useResourcesServiceResourceUsageGetActiveSession({ resourceId }, undefined);
  const usage = active?.usage ?? null;
  const metered = (usage?.energyCreditsPerKwh ?? 0) > 0;
  const { data: live } = useResourceMeteringServiceGetResourceMeteringLive({ resourceId }, undefined, {
    enabled: metered,
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
  const energyCredits = live?.session?.energyCredits ?? 0;
  const gross =
    (usage.creditsPerUsage ?? 0) +
    (usage.sessionDurationCreditsPerMinute ?? 0) * Math.ceil(elapsedMs / 60_000) +
    energyCredits;
  const estimate = Math.round((gross * (usage.billingFactor ?? 100)) / 100);
  const hasBillableRates = gross > 0 || metered;
  const reading = live?.session?.latestKwh;

  return (
    <div className="flex flex-col gap-2" data-cy="live-session-billing">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity className="size-4" />
        {t('live.title')}
      </div>
      <dl className={dlClass}>
        <dt>{t('live.sessionTime')}</dt>
        <dd className={valueClass}>{formatDurationMs(elapsedMs)}</dd>
        {metered && (
          <>
            <dt>{t('live.meter')}</dt>
            <dd className={valueClass} data-cy="live-meter-value">
              {reading == null ? (
                <span className="text-foreground-500">{t('live.meterWaiting')}</span>
              ) : (
                <>
                  {t('live.meterValue', { value: formatKwh(Number(reading)) })}
                  {live?.session?.latestObservedAt && (
                    <>
                      <br />
                      <small className="text-foreground-500">
                        {t('live.meterAsOf', { time: new Date(live.session.latestObservedAt).toLocaleTimeString() })}
                      </small>
                    </>
                  )}
                </>
              )}
            </dd>
            <dt>{t('live.energyCost')}</dt>
            <dd className={valueClass}>{reading == null ? '-' : money(energyCredits)}</dd>
          </>
        )}
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
