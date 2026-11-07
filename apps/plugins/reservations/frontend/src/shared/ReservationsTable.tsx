import { Button, EmptyState, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { Link } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from './StatusChip';
import type { ReservationAction } from '../api';

interface Props {
  items: Reservation[];
  timezone: string | null;
  ariaLabel: string;
  showUser?: boolean;
  /** The query is still loading; shows a spinner instead of the (not yet known) empty state. */
  isPending?: boolean;
  /** The query failed; shows the localised message with a retry button. */
  error?: unknown;
  onRetry?: () => void;
  onAction: (action: ReservationAction, reservation: Reservation) => void;
}

/**
 * Shared bookings list; each row offers exactly the actions the API says are possible. Rows wrap
 * instead of scrolling, so every action stays reachable on a phone.
 */
export function ReservationsTable({
  items,
  timezone,
  ariaLabel,
  showUser,
  isPending,
  error,
  onRetry,
  onAction,
}: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(timezone);

  if (error) {
    return (
      <div className="rv:flex rv:flex-col rv:items-start rv:gap-3" data-cy="reservations-list-error">
        <StatusAlert status="danger" title={t('table.loadFailed')}>
          {describeError(error, t)}
        </StatusAlert>
        {onRetry && (
          <Button size="sm" variant="secondary" onPress={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    );
  }
  if (isPending) return <TableDataLoadingIndicator label={t('common.loading')} />;
  if (items.length === 0) return <EmptyState message={t('table.empty')} />;

  return (
    <ul aria-label={ariaLabel} className="rv:flex rv:flex-col rv:divide-y rv:divide-separator">
      {items.map((item) => {
        const reason = item.status === 'rejected' ? (item.decisionReason ?? item.cancelReason) : item.cancelReason;
        return (
          <li
            key={item.id}
            className="rv:flex rv:flex-wrap rv:items-start rv:justify-between rv:gap-x-4 rv:gap-y-2 rv:py-3"
            data-cy={`reservations-row-${item.id}`}
          >
            <div className="rv:flex rv:min-w-0 rv:flex-col rv:gap-1">
              <span className="rv:flex rv:flex-wrap rv:items-center rv:gap-2">
                <Link href={`/reservations/${item.id}`} className="rv:font-medium">
                  {item.resourceName ?? `#${item.resourceId}`}
                </Link>
                <StatusChip status={item.status} />
              </span>
              <span className="rv:text-sm">{format.range(item.startTime, item.endTime)}</span>
              {showUser && <span className="rv:text-sm rv:text-muted">{item.userName ?? '–'}</span>}
              {reason && <span className="rv:text-sm rv:text-muted">{t('table.reason', { reason })}</span>}
            </div>
            <div className="rv:flex rv:flex-wrap rv:gap-2">
              {item.canDecide && (
                <>
                  <Button size="sm" variant="primary" onPress={() => onAction('approve', item)}>
                    {t('actions.approve.label')}
                  </Button>
                  <Button size="sm" variant="secondary" onPress={() => onAction('reject', item)}>
                    {t('actions.reject.label')}
                  </Button>
                </>
              )}
              {item.canKeep && (
                <Button size="sm" variant="secondary" onPress={() => onAction('keep', item)}>
                  {t('actions.keep.label')}
                </Button>
              )}
              {item.canEndEarly && (
                <Button size="sm" variant="secondary" onPress={() => onAction('end-early', item)}>
                  {t('actions.end-early.label')}
                </Button>
              )}
              {item.canCancel && (
                <Button size="sm" variant="tertiary" onPress={() => onAction('cancel', item)}>
                  {t('actions.cancel.label')}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
