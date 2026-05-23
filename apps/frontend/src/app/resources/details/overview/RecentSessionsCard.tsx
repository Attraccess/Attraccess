// Recent sessions card showing logged-in user's last 3 resource runs
// FEATURE: ATT-386 Resource details page Overview tab
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { FlatSection } from '../../../../components/flatSection';
import { History, CheckCircle2, CircleDashed } from 'lucide-react';
import { Spinner } from '@heroui/react';
import { useResourcesServiceResourceUsageGetHistory, ResourceUsage } from '@attraccess/react-query-client';
import en from './recentSessionsCard.en.json';
import de from './recentSessionsCard.de.json';

interface RecentSessionsCardProps {
  resourceId: number;
}

function formatDuration(start: string, end?: string | null): string {
  if (!end) return '…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatCost(session: ResourceUsage, fallback: string): string {
  const cost = (session as unknown as { cost?: number; currency?: string }).cost;
  if (typeof cost !== 'number' || cost <= 0) return fallback;
  const currency = (session as unknown as { currency?: string }).currency ?? '';
  return `${cost.toFixed(2)} ${currency}`.trim();
}

export function RecentSessionsCard({ resourceId }: RecentSessionsCardProps) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const { data, isLoading } = useResourcesServiceResourceUsageGetHistory(
    { resourceId, page: 1, limit: 3, userId: user?.id },
    undefined,
    { enabled: !!user?.id }
  );

  const sessions = useMemo(() => data?.data ?? [], [data]);

  return (
    <FlatSection
      icon={<History className="w-4 h-4" />}
      title={t('title')}
      actions={
        <Link
          to={`/resources/${resourceId}/history`}
          className="text-sm text-primary hover:underline"
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
        <div data-cy="recent-sessions-empty" className="text-sm text-foreground-500 py-2">
          {t('empty')}
        </div>
      ) : (
        <ul className="divide-y divide-divider">
          {sessions.map((session) => (
            <li key={session.id} data-cy="recent-sessions-row" className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 text-foreground-700">{formatDate(session.startTime)}</span>
              <span className="text-foreground-500">{formatDuration(session.startTime, session.endTime)}</span>
              <span className="text-foreground-500">{formatCost(session, t('noCost'))}</span>
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
