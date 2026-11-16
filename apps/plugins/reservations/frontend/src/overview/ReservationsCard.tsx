import { Button, StatusAlert, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Chip, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReservationsTranslations } from '../i18n';
import { describeCode, describeError } from '../lib/errors';
import { useAvailability, useResourceName } from '../lib/queries';
import { addLocalDays, localDateOf, startOfLocalDay, type LocalDate } from '../lib/time';
import type { Availability, Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { TimezoneHint } from '../shared/TimezoneHint';
import { useReservationActions } from '../shared/useReservationActions';
import { AvailabilityTimeline } from './AvailabilityTimeline';
import { BookingModal } from './BookingModal';
import { KeepFreeDialog } from './KeepFreeDialog';
import { NextBooking } from './NextBooking';

type View = 'day' | 'week';

/** Flat section like the host's other overview cards; it must not be split across the page columns. */
function Section({ actions, children }: Readonly<{ actions?: ReactNode; children: ReactNode }>) {
  const { t } = useReservationsTranslations();
  return (
    <section className="rv:w-full rv:break-inside-avoid rv:mb-6" data-cy="reservations-card">
      <header className="rv:flex rv:flex-wrap rv:items-center rv:justify-between rv:gap-2 rv:border-b rv:border-separator rv:pb-2 rv:mb-3">
        <div className="rv:flex rv:items-center rv:gap-2 rv:text-accent">
          <CalendarCheckIcon className="rv:size-4" />
          <h3 className="rv:text-xs rv:font-semibold rv:uppercase rv:tracking-wider">{t('card.title')}</h3>
        </div>
        {actions && <div className="rv:flex rv:flex-wrap rv:items-center rv:gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * `resource.overview` slot. Renders nothing until the first answer says reservations are enabled
 * (so the card never flashes on resources without them), and nothing while they are disabled.
 */
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

  // Navigation keeps the previous range on screen while the next one loads. After a failed range
  // the last good answer still drives the header and the navigation, so the user can go back.
  const query = useAvailability(resourceId, from, to, true, true);
  const [lastGood, setLastGood] = useState<Availability | null>(null);
  useEffect(() => {
    if (query.data) setLastGood(query.data);
  }, [query.data]);
  const availability = query.data ?? lastGood;
  // While the next range loads the old entries stay on screen, so the old day headings stay with them.
  const shownDays = useRef(days);
  if (!query.isPlaceholderData) shownDays.current = days;
  const reportedZone = availability?.timezone;
  useEffect(() => {
    if (reportedZone) setZoneGuess(reportedZone);
  }, [reportedZone]);

  const resourceName = useResourceName(resourceId);
  const actions = useReservationActions({ timezone: availability?.timezone });
  const format = useFormatters(availability?.timezone);

  if (availability?.enabled === false) return null;

  const failure = query.isError ? (
    <div className="rv:flex rv:flex-col rv:items-start rv:gap-2" data-cy="reservations-load-error">
      <StatusAlert status="danger" title={t('card.loadFailed')}>
        {describeError(query.error, t)}
      </StatusAlert>
      <Button size="sm" variant="secondary" onPress={() => void query.refetch()} data-cy="reservations-retry">
        {t('common.retry')}
      </Button>
    </div>
  ) : null;

  if (!availability) {
    // A failed first load still shows the card with Retry; a pending one shows nothing yet.
    return failure ? <Section>{failure}</Section> : null;
  }

  return (
    <Section
      actions={
        availability.canBook.allowed ? (
          <Button variant="primary" onPress={() => setBookingOpen(true)} data-cy="reservations-reserve">
            {t('card.reserve')}
          </Button>
        ) : (
          <Chip size="sm" data-cy="reservations-cannot-book">
            {availability.canBook.reason ? describeCode(availability.canBook.reason, t) : t('card.cannotBook')}
          </Chip>
        )
      }
    >
      <div className="rv:flex rv:flex-col rv:gap-4">
        <TimezoneHint timezone={availability.timezone} />
        {availability.isManager && <p className="rv:text-xs rv:text-muted">{t('card.managerHint')}</p>}
        <NextBooking resourceId={resourceId} timezone={availability.timezone} onAsk={actions.ask} />
        <div className="rv:flex rv:flex-wrap rv:items-center rv:gap-2">
          <ToggleButtonGroup
            aria-label={t('card.view')}
            size="sm"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[view]}
            onSelectionChange={(keys) => {
              setView(keys.has('day') ? 'day' : 'week');
              setOffset(0);
            }}
            data-cy="reservations-view"
          >
            <ToggleButton id="day">{t('card.day')}</ToggleButton>
            <ToggleButton id="week">{t('card.week')}</ToggleButton>
          </ToggleButtonGroup>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            isDisabled={offset <= 0}
            onPress={() => setOffset(offset - 1)}
            aria-label={t('card.previous')}
          >
            <ChevronLeftIcon className="rv:w-4 rv:h-4" />
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            onPress={() => setOffset(offset + 1)}
            aria-label={t('card.nextRange')}
          >
            <ChevronRightIcon className="rv:w-4 rv:h-4" />
          </Button>
        </div>
        {failure ?? (
          <div className={query.isPlaceholderData ? 'rv:opacity-50' : undefined} aria-busy={query.isPlaceholderData}>
            <AvailabilityTimeline
              availability={availability}
              days={query.isPlaceholderData ? shownDays.current : days}
            />
          </div>
        )}
      </div>
      <BookingModal
        resourceId={resourceId}
        resourceName={resourceName}
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
      <KeepFreeDialog
        resourceId={resourceId}
        timezone={availability.timezone}
        reservations={availability.reservations}
      />
      {actions.dialogs}
    </Section>
  );
}
