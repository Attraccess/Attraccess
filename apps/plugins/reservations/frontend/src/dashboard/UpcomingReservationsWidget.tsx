import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Link, Spinner } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';
import { useIsManagerAnywhere, useMyReservations, usePluginTimezone } from '../lib/queries';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';

const MAX_RESERVATIONS = 3;

/** Dashboard widget: the user's next bookings, each opening its detail page. */
export function UpcomingReservationsWidget() {
  const { t } = useReservationsTranslations();
  const timezone = usePluginTimezone();
  const format = useFormatters(timezone);
  const upcoming = useMyReservations('upcoming');
  const isManager = useIsManagerAnywhere();

  const renderList = () => {
    if (upcoming.isError) return <StatusAlert status="danger" title={t('dashboard.loadError')} />;
    // Times wait for the plugin timezone, like the reservations page.
    if (upcoming.isPending || timezone === null) return <Spinner size="sm" />;
    const next = upcoming.data.slice(0, MAX_RESERVATIONS);
    if (next.length === 0) return <p className="rv:text-sm rv:text-muted">{t('dashboard.empty')}</p>;
    return (
      <ul className="rv:flex rv:flex-col rv:gap-2">
        {next.map((reservation) => (
          <li
            key={reservation.id}
            className="rv:flex rv:flex-wrap rv:items-center rv:gap-2"
            data-cy="reservations-widget-item"
          >
            <Link
              href={`/reservations/${reservation.id}`}
              className="rv:flex rv:min-w-0 rv:flex-col rv:items-start rv:no-underline"
            >
              <span className="rv:truncate rv:text-sm rv:font-medium">
                {reservation.resourceName ?? t('dashboard.unknownResource')}
              </span>
              <span className="rv:text-xs rv:text-muted">
                {format.range(reservation.startTime, reservation.endTime)}
              </span>
            </Link>
            {reservation.status !== 'confirmed' && <StatusChip status={reservation.status} />}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="rv:flex rv:flex-col rv:gap-3" data-cy="reservations-widget">
      {renderList()}
      <div className="rv:flex rv:flex-wrap rv:gap-4">
        <Link href="/reservations" data-cy="reservations-widget-mine">
          {t('dashboard.mine')}
        </Link>
        {isManager && (
          <Link href="/reservations/manage" data-cy="reservations-widget-manage">
            {t('dashboard.manage')}
          </Link>
        )}
      </div>
    </div>
  );
}
