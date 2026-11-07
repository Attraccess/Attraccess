import { useReservationsTranslations } from '../i18n';
import type { BookingRules } from '../lib/types';

/** Plain-language summary of the check-in rules a booking is subject to. */
export function CheckInRules({ rules }: Readonly<{ rules: BookingRules }>) {
  const { t } = useReservationsTranslations();
  return (
    <p className="rv:text-sm rv:text-muted" data-cy="reservations-checkin-rules">
      {rules.checkInEnabled
        ? t('checkIn.required', { grace: rules.checkInGraceMinutes, early: rules.earlyCheckInMinutes })
        : t('checkIn.notRequired')}
    </p>
  );
}
