import { Button } from '@attraccess/plugins-frontend-ui';
import { Card, Chip } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useReservationsTranslations } from '../i18n';
import { useAvailability } from '../lib/queries';
import { addLocalDays, localDateOf, startOfLocalDay, type LocalDate } from '../lib/time';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';
import { useReservationActions } from '../shared/useReservationActions';
import { AvailabilityTimeline } from './AvailabilityTimeline';
import { BookingModal } from './BookingModal';
import { KeepFreeDialog } from './KeepFreeDialog';

type View = 'day' | 'week';

/** `resource.overview` slot: renders nothing unless reservations are enabled for the resource. */
export function ReservationsCard({ resourceId }: Readonly<{ resourceId: number }>) {
  const { t } = useReservationsTranslations();
  const [view, setView] = useState<View>('week');
  const [offset, setOffset] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booked, setBooked] = useState<Reservation | null>(null);

  // The first request learns the timezone; the timeline range is derived from it.
  const [zoneGuess, setZoneGuess] = useState<string | null>(null);
  const zone = zoneGuess ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const span = view === 'week' ? 7 : 1;
  const today = useMemo(() => localDateOf(new Date(), zone), [zone]);
  const first = addLocalDays(today, offset * span);
  const days: LocalDate[] = Array.from({ length: span }, (_, index) => addLocalDays(first, index));
  const from = startOfLocalDay(first, zone);
  const to = startOfLocalDay(addLocalDays(first, span), zone);

  const query = useAvailability(resourceId, from, to);
  const availability = query.data;
  const reportedZone = availability?.timezone;
  useEffect(() => {
    if (reportedZone) setZoneGuess(reportedZone);
  }, [reportedZone]);

  const actions = useReservationActions({ timezone: availability?.timezone });
  const format = useFormatters(availability?.timezone);

  // Only the nearest own booking that has not ended is highlighted above the timeline.
  const next = useMemo(() => {
    const now = Date.now();
    return (availability?.reservations ?? [])
      .filter(
        (r) => r.mine && (r.status === 'confirmed' || r.status === 'pending') && new Date(r.endTime).getTime() > now,
      )
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
  }, [availability]);

  if (!availability?.enabled) return null;

  return (
    <Card data-cy="reservations-card">
      <Card.Header className="rv:flex rv:flex-row rv:flex-wrap rv:items-center rv:justify-between rv:gap-2">
        <div>
          <Card.Title>{t('card.title')}</Card.Title>
          <Card.Description>{t('card.timezone', { timezone: availability.timezone })}</Card.Description>
        </div>
        {availability.canBook.allowed ? (
          <Button variant="primary" onPress={() => setBookingOpen(true)} data-cy="reservations-reserve">
            {t('card.reserve')}
          </Button>
        ) : (
          <Chip size="sm" data-cy="reservations-cannot-book">
            {availability.canBook.reason ?? t('card.cannotBook')}
          </Chip>
        )}
      </Card.Header>
      <Card.Content className="rv:flex rv:flex-col rv:gap-4">
        {availability.isManager && <p className="rv:text-xs rv:text-muted">{t('card.managerHint')}</p>}
        {next && (
          <div className="rv:flex rv:flex-wrap rv:items-center rv:justify-between rv:gap-2" data-cy="reservations-next">
            <div className="rv:flex rv:flex-col rv:gap-1">
              <span className="rv:text-sm rv:font-medium">{t('card.next')}</span>
              <span className="rv:flex rv:items-center rv:gap-2 rv:text-sm">
                {format.range(next.startTime, next.endTime)}
                <StatusChip status={next.status} />
              </span>
            </div>
            <div className="rv:flex rv:gap-2">
              {next.canEndEarly && (
                <Button size="sm" variant="secondary" onPress={() => actions.ask('end-early', next)}>
                  {t('actions.end-early.label')}
                </Button>
              )}
              {next.canCancel && (
                <Button size="sm" variant="tertiary" onPress={() => actions.ask('cancel', next)}>
                  {t('actions.cancel.label')}
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="rv:flex rv:flex-wrap rv:items-center rv:gap-2">
          <Button
            size="sm"
            variant={view === 'day' ? 'primary' : 'tertiary'}
            onPress={() => {
              setView('day');
              setOffset(0);
            }}
          >
            {t('card.day')}
          </Button>
          <Button
            size="sm"
            variant={view === 'week' ? 'primary' : 'tertiary'}
            onPress={() => {
              setView('week');
              setOffset(0);
            }}
          >
            {t('card.week')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={offset <= 0}
            onPress={() => setOffset(offset - 1)}
            aria-label={t('card.previous')}
          >
            ‹
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setOffset(offset + 1)} aria-label={t('card.nextRange')}>
            ›
          </Button>
        </div>
        <AvailabilityTimeline availability={availability} days={days} />
      </Card.Content>
      <BookingModal
        resourceId={resourceId}
        availability={availability}
        isOpen={bookingOpen}
        onOpenChange={setBookingOpen}
        onBooked={setBooked}
      />
      <StatusDialog
        isOpen={booked !== null}
        onClose={() => setBooked(null)}
        status="success"
        title={booked?.status === 'pending' ? t('booking.requestedTitle') : t('booking.bookedTitle')}
        data-cy="reservations-booked-dialog"
      >
        {booked
          ? t(booked.status === 'pending' ? 'booking.requestedBody' : 'booking.bookedBody', {
              range: format.range(booked.startTime, booked.endTime),
            })
          : ''}
      </StatusDialog>
      <KeepFreeDialog resourceId={resourceId} timezone={availability.timezone} />
      {actions.dialogs}
    </Card>
  );
}
