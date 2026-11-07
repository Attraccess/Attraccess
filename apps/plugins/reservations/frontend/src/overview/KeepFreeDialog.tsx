import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { reservationAction } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useInvalidateReservations, usePendingDecision } from '../lib/queries';
import { useFormatters } from '../lib/useFormatters';

/**
 * Asks the holder what to do with the rest of a booking after their session ended early. Closing
 * the dialog (Escape) means "keep", which is also the server's default when nobody answers.
 */
export function KeepFreeDialog(props: Readonly<{ resourceId: number; timezone: string }>) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(props.timezone);
  const invalidate = useInvalidateReservations();
  const decision = usePendingDecision(props.resourceId, true);
  const [error, setError] = useState<string | null>(null);

  const answer = useMutation({
    mutationFn: (action: 'keep' | 'end-early') => reservationAction(decision.data?.id ?? 0, action),
    onSettled: () => invalidate(),
    onError: (failure) => setError(describeError(failure, t)),
  });

  const reservation = decision.data ?? null;
  return (
    <>
      <StatusDialog
        isOpen={reservation !== null && !answer.isPending && !answer.isSuccess}
        onClose={() => answer.mutate('keep')}
        status="info"
        title={reservation ? t('keepFree.title', { until: format.time(reservation.endTime) }) : ''}
        action={{ label: t('keepFree.free'), onPress: () => answer.mutate('end-early'), isPending: answer.isPending }}
        closeLabel={t('keepFree.keep')}
        data-cy="reservations-keep-free-dialog"
      >
        {t('keepFree.body')}
      </StatusDialog>
      <StatusDialog
        isOpen={error !== null}
        onClose={() => setError(null)}
        status="error"
        title={t('actions.failedTitle')}
      >
        {error ?? ''}
      </StatusDialog>
    </>
  );
}
