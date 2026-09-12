import {
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { useMemo, useCallback, useEffect, useState } from 'react';
import { useTranslations, useNumberFormatter, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useProjectsServiceGetProjectUsageStats } from '@attraccess/react-query-client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Rectangle,
} from 'recharts';
import type { TooltipContentProps } from 'recharts/types/component/Tooltip';
import type { Payload as TooltipPayload } from 'recharts/types/component/DefaultTooltipContent';
import en from './en.json';
import de from './de.json';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { EmptyState } from '../../../../../components/emptyState';

type ProjectUsageChartsProps = {
  projectId: number;
};

const TOOLTIP_CONTAINER_CLASS =
  'rounded-lg border border-border bg-surface/95 px-3 py-2 text-foreground shadow-xl backdrop-blur-md';
const TOOLTIP_LABEL_CLASS = 'text-xs font-medium text-muted';
const TOOLTIP_DOT_CLASS = 'h-2 w-2 rounded-full';
const TOOLTIP_VALUE_CLASS = 'ml-auto font-semibold text-foreground';
const CHART_COLORS = {
  sessions: { base: 'var(--chart-sessions)', active: 'var(--chart-sessions-active)' },
  minutes: { base: 'var(--chart-minutes)', active: 'var(--chart-minutes-active)' },
  spend: 'var(--chart-spend)',
};
type ChartTooltipProps = TooltipContentProps;
type ChartTooltipPayload = TooltipPayload;

export function ProjectUsageCharts({ projectId }: ProjectUsageChartsProps) {
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

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card className="min-h-[360px]">
        <Card.Header>
          <div>
            <p className="font-semibold">{t('charts.timeSeries.title')}</p>
            <p className="text-xs text-muted">{t('charts.title')}</p>
          </div>
        </Card.Header>
        <Card.Content className="h-[320px]">
          {isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : chartData.length === 0 ? (
            <EmptyState message={t('charts.timeSeries.empty')} />
          ) : !canRenderCharts ? (
            <Skeleton className="w-full h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--muted)" />
                <YAxis
                  yAxisId="minutes"
                  stroke="var(--muted)"
                  label={{ value: t('tooltip.minutes'), angle: -90, position: 'insideLeft', fill: 'var(--muted)' }}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="right"
                  stroke="var(--muted)"
                  label={{ value: t('tooltip.spend'), angle: 90, position: 'insideRight', fill: 'var(--muted)' }}
                />
                <Tooltip content={renderTimeSeriesTooltip} cursor={{ stroke: 'var(--border)' }} />
                <Legend labelStyle={{ color: 'var(--foreground)' }} inactiveColor="var(--muted)" />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  stroke={CHART_COLORS.minutes.base}
                  yAxisId="minutes"
                  name={t('tooltip.minutes')}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ fill: CHART_COLORS.minutes.active, stroke: 'var(--surface)' }}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke={CHART_COLORS.spend}
                  yAxisId="spend"
                  name={`${t('tooltip.spend')} (${data?.summary.currency ?? ''})`}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ fill: CHART_COLORS.spend, stroke: 'var(--surface)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card.Content>
      </Card>

      <Card className="min-h-[360px]">
        <Card.Header>
          <div>
            <p className="font-semibold">{t('charts.topResources.title')}</p>
            <p className="text-xs text-muted">{t('charts.title')}</p>
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </>
          ) : topResources.length === 0 ? (
            <EmptyState message={t('charts.topResources.empty')} />
          ) : (
            <>
              <div className="h-40">
                {canRenderCharts ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topResources}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="resourceName" stroke="var(--muted)" />
                      <YAxis stroke="var(--muted)" />
                      <Tooltip content={renderTopResourcesTooltip} cursor={{ fill: 'var(--surface-secondary)' }} />
                      <Legend labelStyle={{ color: 'var(--foreground)' }} inactiveColor="var(--muted)" />
                      <Bar
                        dataKey="sessions"
                        fill={CHART_COLORS.sessions.base}
                        name={t('tooltip.sessions')}
                        activeBar={
                          <Rectangle
                            fill={CHART_COLORS.sessions.active}
                            stroke={CHART_COLORS.sessions.base}
                            strokeWidth={2}
                          />
                        }
                      />
                      <Bar
                        dataKey="minutes"
                        fill={CHART_COLORS.minutes.base}
                        name={t('tooltip.minutes')}
                        activeBar={
                          <Rectangle
                            fill={CHART_COLORS.minutes.active}
                            stroke={CHART_COLORS.minutes.base}
                            strokeWidth={2}
                          />
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Skeleton className="h-full w-full" />
                )}
              </div>
              <Table>
                <TableScrollContainer>
                  <TableContent aria-label={t('charts.topResources.table.ariaLabel')}>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('charts.topResources.columns.resource')}</TableColumn>
                      <TableColumn>{t('charts.topResources.columns.sessions')}</TableColumn>
                      <TableColumn>{t('charts.topResources.columns.minutes')}</TableColumn>
                      <TableColumn>{t('charts.topResources.columns.spend')}</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {topResources.map((resource) => (
                        <TableRow key={resource.resourceId} id={resource.resourceId}>
                          <TableCell>{resource.resourceName}</TableCell>
                          <TableCell>{formatNumber(resource.sessions)}</TableCell>
                          <TableCell>{formatNumber(resource.minutes)}</TableCell>
                          <TableCell>
                            {data
                              ? `${data.summary.currency} ${formatNumber(
                                  dbCurrencyToUserCurrency(resource.spend, data.summary.minorUnit),
                                )}`
                              : formatNumber(resource.spend)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            </>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
