import { Button } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import type { ReservationAction } from '../api';
import { useReservationsTranslations } from '../i18n';
import { useMyReservations } from '../lib/queries';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';

interface Props {
  resourceId: number;
  timezone: string;
  onAsk: (action: ReservationAction, reservation: Reservation) => void;
}

/**
 * The caller's nearest live booking of this resource, independent of the range the timeline
 * shows. A booking that is running right now reads "Current booking" instead of "next".
 */
export function NextBooking({ resourceId, timezone, onAsk }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(timezone);
  const upcoming = useMyReservations('upcoming');

  // The API lists live bookings (not ended yet) by start; the first of this resource is the one.
  const next = useMemo(
    () => (upcoming.data ?? []).find((reservation) => reservation.resourceId === resourceId),
    [upcoming.data, resourceId],
  );
  if (!next) return null;

  const running = new Date(next.startTime).getTime() <= Date.now();
  return (
    <div className="rv:flex rv:flex-wrap rv:items-center rv:justify-between rv:gap-2" data-cy="reservations-next">
      <div className="rv:flex rv:flex-col rv:gap-1">
        <span className="rv:text-sm rv:font-medium">{running ? t('card.current') : t('card.next')}</span>
        <span className="rv:flex rv:items-center rv:gap-2 rv:text-sm">
          {format.range(next.startTime, next.endTime)}
          <StatusChip status={next.status} />
        </span>
      </div>
      <div className="rv:flex rv:gap-2">
        {next.canEndEarly && (
          <Button size="sm" variant="secondary" onPress={() => onAsk('end-early', next)}>
            {t('actions.end-early.label')}
          </Button>
        )}
        {next.canCancel && (
          <Button size="sm" variant="tertiary" onPress={() => onAsk('cancel', next)}>
            {t('actions.cancel.label')}
          </Button>
        )}
      </div>
    </div>
  );
}
