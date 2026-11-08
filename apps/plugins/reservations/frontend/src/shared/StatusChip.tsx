import { Chip } from '@heroui/react';
import { useReservationsTranslations } from '../i18n';
import type { ReservationStatus } from '../lib/types';

const COLOR = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'danger',
  cancelled: 'default',
  expired: 'default',
  no_show: 'danger',
  completed: 'default',
} as const;

export function StatusChip({ status }: Readonly<{ status: ReservationStatus }>) {
  const { t } = useReservationsTranslations();
  return (
    <Chip size="sm" color={COLOR[status]} className="rv:whitespace-nowrap">
      {t(`status.${status}`)}
    </Chip>
  );
}
