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
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { EmptyState } from '../../../../../components/emptyState';
import { ProjectUsageChartsProps } from './index.contracts';
import { CHART_COLORS } from './index.state';
import { useProjectUsageChartsState } from './useProjectUsageChartsState';

export function ProjectUsageCharts({ projectId }: ProjectUsageChartsProps) {
  const {
    t,
    formatNumber,
    data,
    isLoading,
    canRenderCharts,
    chartData,
    topResources,
    renderTimeSeriesTooltip,
    renderTopResourcesTooltip,
  } = useProjectUsageChartsState({ projectId });

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
