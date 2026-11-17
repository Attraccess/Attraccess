import { useEffect, useState } from 'react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { DashboardWidgetRenderProps, DashboardWidgetSize } from '@attraccess/plugins-frontend-sdk';
import { Link, Spinner } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';
import { useIsManagerAnywhere, useMyReservations, usePluginTimezone } from '../lib/queries';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';
import type { Reservation } from '../lib/types';

/** How many bookings each tile size lists. The tile has a fixed height, so it shows a fixed number instead of growing. */
const MAX_RESERVATIONS: Record<DashboardWidgetSize, number> = { small: 1, medium: 3, large: 7 };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The current time, updated every minute so relative starts stay right. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "in 2 hr" within a day, "now" once started, otherwise the start date. */
function useRelativeStart(timezone: string | null) {
  const { t, language } = useReservationsTranslations();
  const format = useFormatters(timezone);
  const now = useNow();

  return (startTime: string) => {
    const delta = new Date(startTime).getTime() - now;
    if (delta <= 0) return t('dashboard.now');
    if (delta >= DAY) return format.dateTime(startTime);
    const relative = new Intl.RelativeTimeFormat(language, { style: 'short', numeric: 'auto' });
    return delta < HOUR
      ? relative.format(Math.max(1, Math.round(delta / MINUTE)), 'minute')
      : relative.format(Math.round(delta / HOUR), 'hour');
  };
}

function NextReservation({ reservation, start }: Readonly<{ reservation: Reservation; start: string }>) {
  const { t } = useReservationsTranslations();
  return (
    <Link
      href={`/reservations/${reservation.id}`}
      className="rv:flex rv:min-w-0 rv:flex-col rv:items-start rv:gap-1 rv:no-underline"
      data-cy="reservations-widget-item"
    >
      <span className="rv:text-xs rv:text-muted">{t('dashboard.next')}</span>
      <span className="rv:w-full rv:truncate rv:text-base rv:font-semibold">
        {reservation.resourceName ?? t('dashboard.unknownResource')}
      </span>
      <span className="rv:text-sm rv:text-muted" data-cy="reservations-widget-start">
        {start}
      </span>
    </Link>
  );
}

/**
 * Dashboard widget: the user's next bookings, each opening its detail page. Small shows the next one with a relative
 * start, medium the next three and large the next seven. The header links to /reservations.
 */
export function UpcomingReservationsWidget({ size = 'medium' }: Partial<DashboardWidgetRenderProps> = {}) {
  const { t } = useReservationsTranslations();
  const timezone = usePluginTimezone();
  const upcoming = useMyReservations('upcoming');
  const isManager = useIsManagerAnywhere();
  const relativeStart = useRelativeStart(timezone);

  const renderList = () => {
    if (upcoming.isError) return <StatusAlert status="danger" title={t('dashboard.loadError')} />;
    // Times wait for the plugin timezone, like the reservations page.
    if (upcoming.isPending || timezone === null) return <Spinner size="sm" />;
    const next = upcoming.data.slice(0, MAX_RESERVATIONS[size]);
    if (next.length === 0) return <p className="rv:text-sm rv:text-muted">{t('dashboard.empty')}</p>;
    if (size === 'small') return <NextReservation reservation={next[0]} start={relativeStart(next[0].startTime)} />;
    return (
      <ul className="rv:flex rv:min-w-0 rv:flex-col rv:gap-1">
        {next.map((reservation) => (
          <li key={reservation.id} className="rv:flex rv:min-w-0 rv:items-center rv:gap-2">
            <Link
              href={`/reservations/${reservation.id}`}
              className="rv:flex rv:min-w-0 rv:flex-1 rv:items-center rv:gap-2 rv:no-underline"
              data-cy="reservations-widget-item"
            >
              <span className="rv:min-w-0 rv:flex-1 rv:truncate rv:text-sm rv:font-medium">
                {reservation.resourceName ?? t('dashboard.unknownResource')}
              </span>
              <span className="rv:shrink-0 rv:text-xs rv:text-muted" data-cy="reservations-widget-start">
                {relativeStart(reservation.startTime)}
              </span>
            </Link>
            {reservation.status !== 'confirmed' && <StatusChip status={reservation.status} />}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="rv:flex rv:min-w-0 rv:flex-col rv:gap-2" data-cy="reservations-widget">
      {renderList()}
      {size !== 'small' && isManager && (
        <Link href="/reservations/manage" className="rv:text-sm" data-cy="reservations-widget-manage">
          {t('dashboard.manage')}
        </Link>
      )}
    </div>
  );
}
