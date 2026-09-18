// Recent sessions card showing logged-in user's last 3 resource runs
// FEATURE: ATT-386 Resource details page Overview tab
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DateTimeDisplay, DurationDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { FlatSection } from '../../../../components/flatSection';
import { History, CheckCircle2, CircleDashed } from 'lucide-react';
import { Spinner } from '@heroui/react';
import { useResourcesServiceResourceUsageGetHistory } from '@attraccess/react-query-client';
import en from './recentSessionsCard.en.json';
import de from './recentSessionsCard.de.json';

interface RecentSessionsCardProps {
  resourceId: number;
  className?: string;
}

export function RecentSessionsCard({ resourceId, className }: RecentSessionsCardProps) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const { data, isLoading } = useResourcesServiceResourceUsageGetHistory(
    { resourceId, page: 1, limit: 3, userId: user?.id },
    undefined,
    { enabled: !!user?.id },
  );

  const sessions = useMemo(() => data?.data ?? [], [data]);

  return (
    <FlatSection
      className={className}
      icon={<History className="w-4 h-4" />}
      title={t('title')}
      actions={
        <Link
          to={`/resources/${resourceId}/history`}
          className="text-sm text-accent hover:underline"
          data-cy="recent-sessions-view-all"
        >
          {t('viewAll')}
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : sessions.length === 0 ? (
        <div data-cy="recent-sessions-empty" className="text-sm text-muted py-2">
          {t('empty')}
        </div>
      ) : (
        <ul className="divide-y divide-divider">
          {sessions.map((session) => (
            <li key={session.id} data-cy="recent-sessions-row" className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 text-foreground">
                <DateTimeDisplay date={session.startTime} />
              </span>
              <span className="text-muted">
                <DurationDisplay
                  minutes={session.usageInMinutes >= 0 ? session.usageInMinutes : null}
                  alternativeText={t('status.running')}
                />
              </span>
              {session.endTime ? (
                <CheckCircle2 className="w-4 h-4 text-success" aria-label={t('status.completed')} />
              ) : (
                <CircleDashed className="w-4 h-4 text-warning" aria-label={t('status.running')} />
              )}
            </li>
          ))}
        </ul>
      )}
    </FlatSection>
  );
}
