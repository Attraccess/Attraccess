import { useState } from 'react';
import { Button, Link, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { SquareIcon } from 'lucide-react';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourcesServiceGetAllResources,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceResourceUsageGetActiveSession,
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn,
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
import { WidgetEmpty, WidgetError, WidgetLinkButton, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

function SessionRow({ resource }: Readonly<{ resource: { id: number; name: string } }>) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const endOwnSession = useEndOwnSession();
  const endSessionErrorMessage = useEndSessionErrorMessage();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  // Shares its cache with the resource card and detail page.
  const { data: activeSession } = useResourcesServiceResourceUsageGetActiveSession({ resourceId: resource.id });
  // The resource need not be pinned, so the row follows its session itself, e.g. one ended at the reader.
  useLiveUpdates({
    topic: 'resource',
    resourceId: resource.id,
    onUpdate: (data) => {
      if (!data.eventType || !SESSION_EVENTS.has(data.eventType)) return;
      void queryClient.invalidateQueries({
        queryKey: UseResourcesServiceResourceUsageGetActiveSessionKeyFn({ resourceId: resource.id }),
      });
      void queryClient.invalidateQueries({ queryKey: mySessionsQueryKey(), exact: true });
    },
  });
  const ownSession = activeSession?.usages.find((usage) => usage.userId === user?.id);

  const stop = async () => {
    setIsStopping(true);
    try {
      await endOwnSession(resource.id);
      toast.success({ title: t('my-sessions.stopped', { name: resource.name }) });
      setIsConfirmOpen(false);
    } catch (error) {
      toast.error(endSessionErrorMessage(error));
    } finally {
      setIsStopping(false);
      void queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
    }
  };

  return (
    <li className="flex items-center gap-3" data-cy="dashboard-my-sessions-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/resources/${resource.id}`} className="truncate text-sm font-medium">
          {resource.name}
        </Link>
        {ownSession && <SessionTimer startTime={ownSession.startTime} />}
      </div>
      <Button
        size="sm"
        variant="danger-soft"
        aria-label={t('my-sessions.stopLabel', { name: resource.name })}
        onPress={() => setIsConfirmOpen(true)}
        data-cy="dashboard-my-sessions-stop"
      >
        <SquareIcon className="w-4 h-4" />
        {t('my-sessions.stop')}
      </Button>
      <StatusDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        status="warning"
        title={t('my-sessions.confirmTitle')}
        action={{
          label: t('my-sessions.stop'),
          onPress: stop,
          isPending: isStopping,
          'data-cy': 'dashboard-my-sessions-confirm',
        }}
      >
        {t('my-sessions.confirmDescription', { name: resource.name })}
      </StatusDialog>
    </li>
  );
}

/** The user's running sessions, each with a live timer and a button to stop it. */
export function MySessionsWidget() {
  const { t } = useTranslations({ en, de });
  const { data, isPending, isError, isFetching } = useResourcesServiceGetAllResources(MY_SESSIONS_QUERY);

  if (isPending) return <WidgetLoading />;
  if (isError || !data) return <WidgetError title={t('loadError')} />;
  if (data.data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <WidgetEmpty>{t('my-sessions.empty')}</WidgetEmpty>
        <WidgetLinkButton href="/resources">{t('my-sessions.browse')}</WidgetLinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3">
        {data.data.map((resource) => (
          <SessionRow key={resource.id} resource={resource} />
        ))}
      </ul>
      {isFetching && <Spinner size="sm" />}
    </div>
  );
}
