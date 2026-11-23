import { useNetworkRestriction } from '../../../hooks/useNetworkRestriction';
import { NetworkRestrictedHint } from '../../../components/networkRestriction/NetworkRestrictedHint';
import { Button, Link } from '@heroui/react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { SquareIcon } from 'lucide-react';
import { ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
import { NetworkRestrictedAction } from '@attraccess/application-models';
import {
  useGetAllResources,
  useGetAllResourcesKey,
  useResourceUsageGetActiveSession,
  UseResourceUsageGetActiveSessionKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useAuth } from '../../../hooks/useAuth';
import { useLiveUpdates } from '../../../utils/live-updates';
import {
  MY_SESSIONS_QUERY,
  mySessionsQueryKey,
} from '../../resourceOverview/activeUsageSessionsBanner/mySessionsQuery';
import {
  useEndOwnSession,
  useEndSessionErrorMessage,
} from '../../resourceOverview/activeUsageSessionsBanner/useEndOwnSession';
import { SESSION_EVENTS } from '../../resources/usage/sessionEvents';
import { SessionTimer } from '../../resources/usage/components/SessionTimer';
import { itemsPerSize, MoreLink, WidgetEmpty, WidgetError, WidgetList, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const SESSIONS_PER_SIZE = { small: 1, medium: 3, large: 7 };

/**
 * One running session: the resource name and the elapsed time on the left, Stop on the right. Stop never shrinks and
 * the left side truncates, so the two cannot overlap. On small tiles, and in rows narrower than about 18rem, Stop
 * shows only its icon.
 */
function SessionRow({
  resource,
  size,
  isPreview,
}: Readonly<{ resource: { id: number; name: string } } & DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const endOwnSession = useEndOwnSession();
  const { isRestricted } = useNetworkRestriction();
  const endSessionErrorMessage = useEndSessionErrorMessage();
  // Shares its cache with the resource card and detail page.
  const { data: activeSession } = useResourceUsageGetActiveSession({ path: { resourceId: resource.id } });
  // The resource need not be pinned, so the row follows its session itself, e.g. one ended at the reader.
  useLiveUpdates({
    topic: 'resource',
    resourceId: resource.id,
    onUpdate: (data) => {
      if (!data.eventType || !SESSION_EVENTS.has(data.eventType)) return;
      void queryClient.invalidateQueries({
        queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId: resource.id } }),
      });
      void queryClient.invalidateQueries({ queryKey: mySessionsQueryKey(), exact: true });
    },
  });
  const ownSession = activeSession?.usages.find((usage) => usage.userId === user?.id);

  const stop = async () => {
    try {
      await endOwnSession(resource.id);
      toast.success({ title: t('my-sessions.stopped', { name: resource.name }) });
    } catch (error) {
      toast.error(endSessionErrorMessage(error));
      // Keeps the confirmation open so the user can retry.
      throw error;
    } finally {
      void queryClient.invalidateQueries({ queryKey: [useGetAllResourcesKey] });
    }
  };

  const isIconOnly = size === 'small';
  return (
    <li className="@container flex min-w-0 items-center gap-2" data-cy="dashboard-my-sessions-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/resources/${resource.id}`}
          className="block min-w-0 max-w-full truncate text-sm font-medium leading-tight"
        >
          {resource.name}
        </Link>
        {ownSession && <SessionTimer startTime={ownSession.startTime} variant="compact" />}
      </div>
      <ConfirmableButton
        label={t('my-sessions.stop')}
        status="warning"
        confirm={{
          title: t('my-sessions.confirmTitle'),
          message: t('my-sessions.confirmDescription', { name: resource.name }),
          confirmDataCy: 'dashboard-my-sessions-confirm',
        }}
        onConfirm={stop}
        renderActivator={(open) => (
          <Button
            size="sm"
            variant="danger-soft"
            isIconOnly={isIconOnly}
            className={isIconOnly ? 'shrink-0' : 'shrink-0 @max-[18rem]:px-2'}
            aria-label={t('my-sessions.stopLabel', { name: resource.name })}
            isDisabled={isRestricted(NetworkRestrictedAction.UsageEnd)}
            onPress={isPreview ? undefined : open}
            data-cy="dashboard-my-sessions-stop"
          >
            <SquareIcon className="w-4 h-4" />
            {!isIconOnly && <span className="@max-[18rem]:sr-only">{t('my-sessions.stop')}</span>}
          </Button>
        )}
      />
    </li>
  );
}

/**
 * The user's running sessions, each with a live timer and a button to stop it: 1 on small tiles, 3 on medium and 7 on
 * large, with "+N more" beyond on small and large.
 */
export function MySessionsWidget({ size, isPreview }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const { data, isPending, isError } = useGetAllResources(MY_SESSIONS_QUERY);

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (data.data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <WidgetEmpty>{t('my-sessions.empty')}</WidgetEmpty>
        <Link href="/resources" className="text-sm" data-cy="dashboard-my-sessions-browse">
          {t('my-sessions.browse')}
        </Link>
      </div>
    );
  }

  const shown = data.data.slice(0, itemsPerSize(size, SESSIONS_PER_SIZE));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <WidgetList>
        {shown.map((resource) => (
          <SessionRow key={resource.id} resource={resource} size={size} isPreview={isPreview} />
        ))}
      </WidgetList>
      <NetworkRestrictedHint actions={NetworkRestrictedAction.UsageEnd} />
      {/* A medium tile has room for its three rows only; its header links to the resources. */}
      {size !== 'medium' && <MoreLink count={(data.total ?? data.data.length) - shown.length} href="/resources" />}
    </div>
  );
}
