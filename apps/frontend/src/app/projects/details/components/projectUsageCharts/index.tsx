import {
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { useMemo } from 'react';
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
} from 'recharts';
import en from './en.json';
import de from './de.json';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { EmptyState } from '../../../../../components/emptyState';

type ProjectUsageChartsProps = {
  projectId: number;
};

export function ProjectUsageCharts({ projectId }: ProjectUsageChartsProps) {
  const { t } = useTranslations({ en, de });
  const formatNumber = useNumberFormatter();
  const formatDate = useDateTimeFormatter({ showTime: false });
  const { data, isLoading } = useProjectsServiceGetProjectUsageStats({ id: projectId });

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

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card className="min-h-[360px]">
        <CardHeader>
          <div>
            <p className="font-semibold">{t('charts.timeSeries.title')}</p>
            <p className="text-xs text-default-500">{t('charts.title')}</p>
          </div>
        </CardHeader>
        <CardBody className="h-[320px]">
          {isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : chartData.length === 0 ? (
            <EmptyState message={t('charts.timeSeries.empty')} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="minutes" label={{ value: t('tooltip.minutes'), angle: -90, position: 'insideLeft' }} />
                <YAxis
                  yAxisId="spend"
                  orientation="right"
                  label={{ value: t('tooltip.spend'), angle: 90, position: 'insideRight' }}
                />
                <Tooltip
                  formatter={(value: number, name) => {
                    if (name === 'spend' && data) {
                      return `${data.summary.currency} ${formatNumber(value)}`;
                    }
                    return formatNumber(value);
                  }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  stroke="#10b981"
                  yAxisId="minutes"
                  name={t('tooltip.minutes')}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke="#2563eb"
                  yAxisId="spend"
                  name={`${t('tooltip.spend')} (${data?.summary.currency ?? ''})`}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card className="min-h-[360px]">
        <CardHeader>
          <div>
            <p className="font-semibold">{t('charts.topResources.title')}</p>
            <p className="text-xs text-default-500">{t('charts.title')}</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topResources}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="resourceName" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name) => {
                        if (name === 'spend' && data) {
                          return `${data.summary.currency} ${formatNumber(
                            dbCurrencyToUserCurrency(value, data.summary.minorUnit),
                          )}`;
                        }
                        return formatNumber(value);
                      }}
                    />
                    <Legend />
                    <Bar dataKey="sessions" fill="#0ea5e9" name={t('tooltip.sessions')} />
                    <Bar dataKey="minutes" fill="#10b981" name={t('tooltip.minutes')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table removeWrapper aria-label="Top resources table">
                <TableHeader>
                  <TableColumn>{t('charts.topResources.columns.resource')}</TableColumn>
                  <TableColumn>{t('charts.topResources.columns.sessions')}</TableColumn>
                  <TableColumn>{t('charts.topResources.columns.minutes')}</TableColumn>
                  <TableColumn>{t('charts.topResources.columns.spend')}</TableColumn>
                </TableHeader>
                <TableBody>
                  {topResources.map((resource) => (
                    <TableRow key={resource.resourceId}>
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
              </Table>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
