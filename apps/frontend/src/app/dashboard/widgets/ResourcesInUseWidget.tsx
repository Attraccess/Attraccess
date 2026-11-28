import { Link } from '@heroui/react';
import { formatUserDisplayName } from '@attraccess/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Resource,
  useGetAllResourcesInUse,
  UseGetAllResourcesInUseKeyFn,
  useResourceUsageGetActiveSession,
  UseResourceUsageGetActiveSessionKeyFn,
} from '@attraccess/react-query-client';
import { useLiveUpdates } from '../../../utils/live-updates';
import { SESSION_EVENTS } from '../../resources/usage/sessionEvents';
import { SessionTimer } from '../../resources/usage/components/SessionTimer';
import { BigNumber, itemsPerSize, MoreLink, WidgetEmpty, WidgetError, WidgetList, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';
import { sessionStartOf } from '../../resources/usage/sessionDuration';

const ROWS_PER_SIZE = { medium: 3, large: 7 };
// Live updates are per resource, so a session started on a resource not listed yet shows up with the next refresh.
const REFRESH_INTERVAL_MS = 30_000;

/** One busy resource: its name, the user when the API shares who it is, and how long it has been running. */
function InUseRow({ resource }: Readonly<{ resource: Resource }>) {
  const queryClient = useQueryClient();
  // The in-use list carries no session details; the active session read does, shared with the status chips.
  const { data: activeSession } = useResourceUsageGetActiveSession({ path: { resourceId: resource.id } });
  // Ends of sessions elsewhere (another tab, the reader) refresh the list at once.
  useLiveUpdates({
    topic: 'resource',
    resourceId: resource.id,
    onUpdate: (data) => {
      if (data.eventType && SESSION_EVENTS.has(data.eventType)) {
        void queryClient.invalidateQueries({ queryKey: UseGetAllResourcesInUseKeyFn() });
        void queryClient.invalidateQueries({
          queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId: resource.id } }),
        });
      }
    },
  });
  const usage = activeSession?.usages?.[0] ?? activeSession?.usage;
  const userName = usage?.user ? formatUserDisplayName(usage.user) : undefined;

  return (
    <li className="flex min-w-0 items-center justify-between gap-2" data-cy="dashboard-in-use-row">
      <span className="flex min-w-0 flex-col">
        <Link href={`/resources/${resource.id}`} className="block min-w-0 max-w-full truncate text-sm leading-tight">
          {resource.name}
        </Link>
        {userName && <span className="truncate text-xs text-muted">{userName}</span>}
      </span>
      {usage && (
        <span className="shrink-0">
          <SessionTimer startTime={sessionStartOf(usage)} variant="compact" />
        </span>
      )}
    </li>
  );
}

/** Which resources are busy right now, as far as the user may see their activity. */
export function ResourcesInUseWidget({ size, isPreview }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  // The dashboard tile refreshes the shared list; a gallery preview polling too would double the requests.
  const { data, isPending, isError } = useGetAllResourcesInUse({}, undefined, {
    refetchInterval: isPreview ? false : REFRESH_INTERVAL_MS,
  });

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (size === 'small') {
    return <BigNumber value={data.length} label={t('resources-in-use.countLabel')} data-cy="dashboard-in-use-count" />;
  }
  if (data.length === 0) return <WidgetEmpty>{t('resources-in-use.empty')}</WidgetEmpty>;

  const shown = data.slice(0, itemsPerSize(size, ROWS_PER_SIZE));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <WidgetList>
        {shown.map((resource) => (
          <InUseRow key={resource.id} resource={resource} />
        ))}
      </WidgetList>
      {size === 'large' && <MoreLink count={data.length - shown.length} href="/resources" />}
    </div>
  );
}
