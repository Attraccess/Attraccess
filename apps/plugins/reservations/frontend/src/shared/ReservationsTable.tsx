import { EmptyState } from '@attraccess/plugins-frontend-ui';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Button } from '@attraccess/plugins-frontend-ui';
import { Link } from 'react-router-dom';
import { useReservationsTranslations } from '../i18n';
import type { Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from './StatusChip';
import type { ReservationAction } from '../api';

interface Props {
  items: Reservation[];
  timezone: string | null;
  ariaLabel: string;
  showUser?: boolean;
  onAction: (action: ReservationAction, reservation: Reservation) => void;
}

/** Shared bookings table; each row offers exactly the actions the API says are possible. */
export function ReservationsTable({ items, timezone, ariaLabel, showUser, onAction }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const format = useFormatters(timezone);

  return (
    <Table>
      <TableScrollContainer>
        <TableContent aria-label={ariaLabel}>
          <TableHeader>
            <TableColumn isRowHeader>{t('table.resource')}</TableColumn>
            <TableColumn>{t('table.when')}</TableColumn>
            {showUser ? <TableColumn>{t('table.user')}</TableColumn> : null}
            <TableColumn>{t('table.status')}</TableColumn>
            <TableColumn className="rv:text-right">{t('table.actions')}</TableColumn>
          </TableHeader>
          <TableBody items={items} renderEmptyState={() => <EmptyState message={t('table.empty')} />}>
            {(item) => (
              <TableRow key={item.id} id={String(item.id)}>
                <TableCell>
                  <Link to={`/reservations/${item.id}`} className="rv:underline">
                    {item.resourceName ?? `#${item.resourceId}`}
                  </Link>
                </TableCell>
                <TableCell>{format.range(item.startTime, item.endTime)}</TableCell>
                {showUser ? <TableCell>{item.userName ?? '–'}</TableCell> : null}
                <TableCell>
                  <StatusChip status={item.status} />
                </TableCell>
                <TableCell>
                  <div className="rv:flex rv:flex-wrap rv:justify-end rv:gap-2">
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
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
