import { useCallback } from 'react';
import { Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ResourceUsage,
  useResourceUsageExtendSession,
  UseResourceUsageGetActiveSessionKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import { mySessionsQueryKey } from '../../../../resourceOverview/activeUsageSessionsBanner/mySessionsQuery';
import { useNow } from '../../hooks/useNow';
import { formatDuration, type ExtendStep } from '../../sessionDuration';
import { ExtendControls } from './ExtendControls';
import en from './translations/en.json';
import de from './translations/de.json';

interface SessionAutoEndProps {
  resourceId: number;
  usage: ResourceUsage;
  /** The viewer owns the session or may end it: they get the extend controls. */
  canExtend: boolean;
}

const timeOf = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "Stops automatically at HH:MM (in X)" with a live countdown, and the extend controls for those who may use them. */
export function SessionAutoEnd({ resourceId, usage, canExtend }: Readonly<SessionAutoEndProps>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const now = useNow();

  const extend = useResourceUsageExtendSession(undefined, {
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }) });
      void queryClient.invalidateQueries({ queryKey: mySessionsQueryKey(), exact: true });
      toast.success({
        title: t('extended'),
        description: session.autoEndAt ? t('extendedDescription', { time: timeOf(new Date(session.autoEndAt)) }) : '',
      });
    },
    onError: (error) => {
      toast.error({ title: t('extendFailed'), description: (error as ApiError).message });
    },
  });

  const onExtend = useCallback(
    (request: { extendByMinutes: ExtendStep } | { toMax: true }) =>
      extend.mutate({ path: { resourceId }, body: { usageId: usage.id, ...request } }),
    [extend, resourceId, usage.id],
  );

  if (!usage.autoEndAt) return null;
  const endsAt = new Date(usage.autoEndAt);
  const remainingMinutes = Math.ceil((endsAt.getTime() - now) / 60_000);

  return (
    <div className="space-y-2" data-cy="session-auto-end">
      <p className="flex items-center gap-2 text-sm" data-cy="session-auto-end-text">
        <Clock className="w-4 h-4 shrink-0" />
        {canExtend
          ? remainingMinutes <= 0
            ? t('stoppingNow')
            : t('stopsAt', { time: timeOf(endsAt), remaining: formatDuration(remainingMinutes) })
          : t('stopsAtReadOnly', { time: timeOf(endsAt) })}
      </p>
      {canExtend && remainingMinutes > 0 && (
        <ExtendControls session={usage} isPending={extend.isPending} onExtend={onExtend} />
      )}
    </div>
  );
}
