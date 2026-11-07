// Agenda for a few local days: one 24 h bar per day showing bookings and maintenance, with the
// entries listed underneath. Others' bookings read "Reserved"; names only appear when the API sent them.
import { Chip } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';
import { addLocalDays, formatDayHeading, startOfLocalDay, type LocalDate } from '../lib/time';
import type { Availability, Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';

interface Entry {
  key: string;
  start: number;
  end: number;
  kind: 'mine' | 'other' | 'pending' | 'maintenance';
  reservation?: Reservation;
}

const BAR_CLASS: Record<Entry['kind'], string> = {
  mine: 'rv:bg-accent',
  other: 'rv:bg-default',
  pending: 'rv:bg-warning',
  maintenance: 'rv:bg-danger',
};

const visible = (reservation: Reservation) => reservation.status === 'pending' || reservation.status === 'confirmed';

function entriesOf(availability: Availability): Entry[] {
  const reservations = availability.reservations.filter(visible).map<Entry>((reservation) => ({
    key: `r${reservation.id}`,
    start: new Date(reservation.startTime).getTime(),
    end: new Date(reservation.endTime).getTime(),
    kind: reservation.status === 'pending' ? 'pending' : reservation.mine ? 'mine' : 'other',
    reservation,
  }));
  const maintenance = availability.maintenance.map<Entry>((span, index) => ({
    key: `m${index}`,
    start: new Date(span.startTime).getTime(),
    end: span.endTime ? new Date(span.endTime).getTime() : Number.MAX_SAFE_INTEGER,
    kind: 'maintenance',
  }));
  return [...reservations, ...maintenance].sort((a, b) => a.start - b.start);
}

export function AvailabilityTimeline(props: Readonly<{ availability: Availability; days: LocalDate[] }>) {
  const { availability, days } = props;
  const { t } = useReservationsTranslations();
  const format = useFormatters(availability.timezone);
  const zone = availability.timezone;
  const entries = entriesOf(availability);

  return (
    <div className="rv:flex rv:flex-col rv:gap-4" data-cy="reservations-timeline">
      {days.map((day) => {
        const dayStart = startOfLocalDay(day, zone).getTime();
        const dayEnd = startOfLocalDay(addLocalDays(day, 1), zone).getTime();
        const dayEntries = entries.filter((entry) => entry.start < dayEnd && entry.end > dayStart);
        return (
          <section key={`${day.year}-${day.month}-${day.day}`} className="rv:flex rv:flex-col rv:gap-2">
            <h4 className="rv:text-sm rv:font-semibold">{formatDayHeading(day, zone, format.locale)}</h4>
            <div
              className="rv:relative rv:h-3 rv:overflow-hidden rv:rounded-full rv:bg-surface-secondary"
              role="img"
              aria-label={t('card.dayBarLabel')}
            >
              {dayEntries.map((entry) => {
                const left = ((Math.max(entry.start, dayStart) - dayStart) / (dayEnd - dayStart)) * 100;
                const width =
                  ((Math.min(entry.end, dayEnd) - Math.max(entry.start, dayStart)) / (dayEnd - dayStart)) * 100;
                return (
                  <span
                    key={entry.key}
                    className={`rv:absolute rv:top-0 rv:h-full ${BAR_CLASS[entry.kind]}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
                  />
                );
              })}
            </div>
            {dayEntries.length === 0 ? (
              <p className="rv:text-sm rv:text-muted">{t('card.free')}</p>
            ) : (
              <ul className="rv:flex rv:flex-col rv:gap-1">
                {dayEntries.map((entry) => (
                  <li key={entry.key} className="rv:flex rv:flex-wrap rv:items-center rv:gap-2 rv:text-sm">
                    <span className="rv:tabular-nums">
                      {format.time(new Date(entry.start))} –{' '}
                      {entry.end === Number.MAX_SAFE_INTEGER ? t('card.openEnd') : format.time(new Date(entry.end))}
                    </span>
                    {entry.kind === 'maintenance' ? (
                      <Chip size="sm" color="danger">
                        {t('card.maintenance')}
                      </Chip>
                    ) : entry.reservation && (entry.reservation.mine || entry.reservation.userName) ? (
                      <>
                        <span>{entry.reservation.mine ? t('card.yours') : entry.reservation.userName}</span>
                        <StatusChip status={entry.reservation.status} />
                      </>
                    ) : (
                      <span>{entry.kind === 'pending' ? t('card.reservedPending') : t('card.reserved')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
