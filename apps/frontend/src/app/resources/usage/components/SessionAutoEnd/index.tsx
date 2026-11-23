import { useCallback } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useDateTimeFormatter, useFormatedDuration, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ResourceUsage,
  useResourceUsageExtendSession,
  UseResourceUsageGetActiveSessionKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import { mySessionsQueryKey } from '../../../../resourceOverview/activeUsageSessionsBanner/mySessionsQuery';
import { useNow } from '../../../../../hooks/useNow';
import { type ExtendStep } from '../../sessionDuration';
import { ExtendControls } from './ExtendControls';
import en from './translations/en.json';
import de from './translations/de.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';

interface SessionAutoEndProps {
  resourceId: number;
  usage: ResourceUsage;
  /** The viewer owns the session or may end it: they get the extend controls. */
  canExtend: boolean;
  /** Center the text and buttons, for centered session cards. */
  centered?: boolean;
}

const COUNTDOWN_INTERVAL_MS = 15_000;

/** "Stops automatically at HH:MM (in X)" with a live countdown, and the extend controls for those who may use them. */
export function SessionAutoEnd({ resourceId, usage, canExtend, centered = false }: Readonly<SessionAutoEndProps>) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const now = useNow(COUNTDOWN_INTERVAL_MS).getTime();
  const formatTime = useDateTimeFormatter({ showDate: false });
  const formatDate = useDateTimeFormatter({ showTime: false });

  /** "at 14:05", or "on 24.11.2026 at 14:05" once the deadline is not today (an extension can reach days ahead). */
  const deadlineText = useCallback(
    (date: Date, reference: number) => {
      const time = formatTime(date) as string;
      return date.toDateString() === new Date(reference).toDateString()
        ? t('deadline.today', { time })
        : t('deadline.otherDay', { date: formatDate(date) as string, time });
    },
    [formatDate, formatTime, t],
  );

  const extend = useResourceUsageExtendSession(undefined, {
    onSuccess: (session) => {
      // The live update refetches these too; do not restart a refetch it already began.
      void queryClient.invalidateQueries(
        { queryKey: UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }) },
        { cancelRefetch: false },
      );
      void queryClient.invalidateQueries({ queryKey: mySessionsQueryKey(), exact: true }, { cancelRefetch: false });
      toast.success({
        title: t('extended'),
        description: session.autoEndAt
          ? t('extendedDescription', { deadline: deadlineText(new Date(session.autoEndAt), Date.now()) })
          : '',
      });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const onExtend = useCallback(
    (request: { extendByMinutes: ExtendStep } | { toMax: true }) =>
      extend.mutate({ path: { resourceId }, body: { usageId: usage.id, ...request } }),
    [extend, resourceId, usage.id],
  );

  const endsAt = usage.autoEndAt ? new Date(usage.autoEndAt) : null;
  const remainingMinutes = endsAt ? Math.ceil((endsAt.getTime() - now) / 60_000) : 0;
  const remaining = useFormatedDuration(Math.max(0, remainingMinutes));

  if (!endsAt) return null;
  const deadline = deadlineText(endsAt, now);

  return (
    <div className={cn('space-y-2', centered && 'text-center')} data-cy="session-auto-end">
      <p
        className={cn('flex items-center gap-2 text-sm', centered && 'justify-center')}
        data-cy="session-auto-end-text"
      >
        <Clock className="w-4 h-4 shrink-0" />
        {canExtend
          ? remainingMinutes <= 0
            ? t('stoppingNow')
            : t('stopsAt', { deadline, remaining })
          : t('stopsAtReadOnly', { deadline })}
      </p>
      {canExtend && remainingMinutes > 0 && (
        <ExtendControls session={usage} isPending={extend.isPending} onExtend={onExtend} centered={centered} />
      )}
    </div>
  );
}
