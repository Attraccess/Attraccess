import { useReservationsTranslations } from '../i18n';

/** "Times in Europe/Berlin": every list that shows booking times names the zone they are in. */
export function TimezoneHint({ timezone }: Readonly<{ timezone: string }>) {
  const { t } = useReservationsTranslations();
  return (
    <p className="rv:text-xs rv:text-muted" data-cy="reservations-timezone-hint">
      {t('common.timesIn', { timezone })}
    </p>
  );
}
