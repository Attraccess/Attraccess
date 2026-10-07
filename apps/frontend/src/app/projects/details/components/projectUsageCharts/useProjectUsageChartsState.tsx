import { useMemo, useCallback, useEffect, useState } from 'react';
import { useTranslations, useNumberFormatter, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useProjectsServiceGetProjectUsageStats } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { ProjectUsageChartsProps } from './index.contracts';
import { TOOLTIP_CONTAINER_CLASS } from './index.state';
import { TOOLTIP_LABEL_CLASS } from './index.state';
import { TOOLTIP_DOT_CLASS } from './index.state';
import { TOOLTIP_VALUE_CLASS } from './index.state';
import { ChartTooltipProps } from './index.contracts';
import { ChartTooltipPayload } from './index.contracts';
export function useProjectUsageChartsState({ projectId }: ProjectUsageChartsProps) {
  const { t } = useTranslations({ en, de });
  const formatNumber = useNumberFormatter();
  const formatDate = useDateTimeFormatter({ showTime: false });
  const { data, isLoading } = useProjectsServiceGetProjectUsageStats({ id: projectId });
  const [canRenderCharts, setCanRenderCharts] = useState(false);

  useEffect(() => {
    setCanRenderCharts(true);
  }, []);

  const chartData = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.timeSeries.map((point) => ({
      date: (() => {
        const parsed = new Date(point.date);
        if (Number.isNaN(parsed.getTime())) {
          return point.date;
        }
        return formatDate(parsed);
      })(),
      minutes: point.minutes,
      sessions: point.sessions,
      spend: dbCurrencyToUserCurrency(point.spend, data.summary.minorUnit),
    }));
  }, [data, formatDate]);

  const topResources = data?.topResources ?? [];

  const renderTimeSeriesTooltip = useCallback(
    (tooltipProps: ChartTooltipProps) => {
      const { active, payload, label } = tooltipProps;
      const typedPayload = (payload ?? []) as ChartTooltipPayload[];

      if (!active || typedPayload.length === 0 || label == null) {
        return null;
      }

      return (
        <div className={TOOLTIP_CONTAINER_CLASS}>
          <p className={TOOLTIP_LABEL_CLASS}>{label}</p>
          <div className="mt-2 space-y-1">
            {typedPayload.map((entry, index) => {
              const numericValue = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
              const isSpend = entry.dataKey === 'spend';
              const formattedValue =
                isSpend && data ? `${data.summary.currency} ${formatNumber(numericValue)}` : formatNumber(numericValue);

              return (
                <div key={String(entry.dataKey ?? index)} className="flex items-center gap-2 text-sm">
                  <span className={TOOLTIP_DOT_CLASS} style={{ backgroundColor: entry.color ?? 'var(--muted)' }} />
                  <span className="text-muted">{entry.name}</span>
                  <span className={TOOLTIP_VALUE_CLASS}>{formattedValue}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    },
    [data, formatNumber],
  );

  const renderTopResourcesTooltip = useCallback(
    (tooltipProps: ChartTooltipProps) => {
      const { active, payload, label } = tooltipProps;
      const typedPayload = (payload ?? []) as ChartTooltipPayload[];

      if (!active || typedPayload.length === 0 || label == null) {
        return null;
      }

      return (
        <div className={TOOLTIP_CONTAINER_CLASS}>
          <p className={TOOLTIP_LABEL_CLASS}>{label}</p>
          <div className="mt-2 space-y-1">
            {typedPayload.map((entry, index) => {
              const numericValue = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
              const value =
                entry.dataKey === 'spend' && data
                  ? `${data.summary.currency} ${formatNumber(
                      dbCurrencyToUserCurrency(numericValue, data.summary.minorUnit),
                    )}`
                  : formatNumber(numericValue);

              return (
                <div key={String(entry.dataKey ?? index)} className="flex items-center gap-2 text-sm">
                  <span className={TOOLTIP_DOT_CLASS} style={{ backgroundColor: entry.color ?? 'var(--muted)' }} />
                  <span className="text-muted">{entry.name}</span>
                  <span className={TOOLTIP_VALUE_CLASS}>{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    },
    [data, formatNumber],
  );
  return {
    t,
    formatNumber,
    data,
    isLoading,
    canRenderCharts,
    chartData,
    topResources,
    renderTimeSeriesTooltip,
    renderTopResourcesTooltip,
  } as const;
}
