import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { reservationAction } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useInvalidateReservations, useMyReservations, usePendingDecision } from '../lib/queries';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';

// setTimeout takes at most a signed 32-bit delay.
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Whether the viewer holds a confirmed booking of this resource that runs right now, from the
 * bookings the card already loaded (the visible range and the viewer's own upcoming list).
 * Re-evaluates exactly when one of those bookings starts or ends.
 */
export function useHoldsRunningBooking(resourceId: number, reservations: Reservation[]): boolean {
  const upcoming = useMyReservations('upcoming');
  const [now, setNow] = useState(() => Date.now());
  const spans = useMemo(
    () =>
      [...reservations, ...(upcoming.data ?? [])]
        .filter((entry) => entry.mine && entry.resourceId === resourceId && entry.status === 'confirmed')
        .map((entry) => ({ start: new Date(entry.startTime).getTime(), end: new Date(entry.endTime).getTime() })),
    [reservations, upcoming.data, resourceId],
  );
  const running = spans.some((span) => span.start <= now && now < span.end);
  const nextChange = Math.min(...spans.flatMap((span) => [span.start, span.end]).filter((time) => time > now));
  useEffect(() => {
    if (!Number.isFinite(nextChange)) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(nextChange - Date.now() + 50, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [nextChange]);
  return running;
}

/**
 * Asks the holder what to do with the rest of a booking after their session ended early. Closing
 * the dialog (Escape) means "keep", which is also the server's default when nobody answers.
 */
export function KeepFreeDialog(props: Readonly<{ resourceId: number; timezone: string; reservations: Reservation[] }>) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(props.timezone);
  const invalidate = useInvalidateReservations();
  const holdsRunning = useHoldsRunningBooking(props.resourceId, props.reservations);
  const decision = usePendingDecision(props.resourceId, holdsRunning);
  const [error, setError] = useState<string | null>(null);
  // A cached question from a booking that has ended since is not asked any more.
  const reservation = holdsRunning ? (decision.data ?? null) : null;

  const answer = useMutation({
    mutationFn: (action: 'keep' | 'end-early') => reservationAction(reservation?.id ?? 0, action),
    onSettled: () => invalidate(),
    onError: (failure) => setError(describeError(failure, t)),
  });

  // An answered question stays closed only until the server's pending decision changes (answered
  // -> none, or a different booking): then the next question must be able to open the dialog.
  const reservationId = reservation?.id ?? null;
  const { reset } = answer;
  useEffect(() => {
    reset();
  }, [reservationId, reset]);

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
