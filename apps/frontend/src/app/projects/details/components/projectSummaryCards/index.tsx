import { Card, CardBody, CardHeader, Skeleton } from '@heroui/react';
import { useTranslations, useNumberFormatter } from '@attraccess/plugins-frontend-ui';
import { ActivityIcon, CircleDollarSignIcon, Clock3Icon } from 'lucide-react';
import { useProjectsServiceGetProjectUsageStats } from '@attraccess/react-query-client';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import en from './en.json';
import de from './de.json';

type ProjectSummaryCardsProps = {
  projectId: number;
};

const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-full bg-primary-50 dark:bg-primary-900 p-2 text-primary">{children}</div>
);

export function ProjectSummaryCards({ projectId }: ProjectSummaryCardsProps) {
  const { t } = useTranslations({ en, de });
  const formatNumber = useNumberFormatter();
  const { data, isLoading } = useProjectsServiceGetProjectUsageStats({ id: projectId });
  const summary = data?.summary;

  const cards = [
    {
      key: 'sessions',
      title: t('summary.sessions.title'),
      description: t('summary.sessions.description'),
      value: summary ? formatNumber(summary.totalSessions ?? 0) : undefined,
      icon: <ActivityIcon className="size-5" />,
    },
    {
      key: 'minutes',
      title: t('summary.minutes.title'),
      description: t('summary.minutes.description'),
      value: summary ? formatNumber(summary.totalMinutes ?? 0) : undefined,
      icon: <Clock3Icon className="size-5" />,
    },
    {
      key: 'spend',
      title: t('summary.spend.title'),
      description: t('summary.spend.description'),
      value: summary
        ? `${summary.currency} ${formatNumber(dbCurrencyToUserCurrency(summary.totalSpend ?? 0, summary.minorUnit))}`
        : undefined,
      icon: <CircleDollarSignIcon className="size-5" />,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="flex items-center gap-4">
            <IconWrapper>{card.icon}</IconWrapper>
            <div>
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="text-xs text-default-500">{card.description}</p>
            </div>
          </CardHeader>
          <CardBody>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : card.value ? (
              <p className="text-3xl font-bold">{card.value}</p>
            ) : (
              <p className="text-default-400 text-sm">{t('summary.empty')}</p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
