import { Button, PageHeader, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useReservation, usePluginTimezone } from '../lib/queries';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';
import { TimezoneHint } from '../shared/TimezoneHint';
import { useReservationActions } from '../shared/useReservationActions';

/**
 * `/reservations/:id?action=keep|cancel`, the target of mail links. Opening it only reads the
 * booking; the requested change happens after an explicit confirmation in a dialog.
 */
export function ReservationDeepLinkPage() {
  const { t } = useReservationsTranslations();
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  // Only the two actions mail links carry; anything else is ignored like a missing parameter.
  const requestedParam = search.get('action');
  const requested = requestedParam === 'keep' || requestedParam === 'cancel' ? requestedParam : null;
  const timezone = usePluginTimezone();
  const format = useFormatters(timezone);
  const query = useReservation(id);
  const actions = useReservationActions({ timezone, onDone: () => navigate('/reservations') });
  const [prompted, setPrompted] = useState(false);

  const reservation = query.data;
  const possible = reservation !== undefined && (requested === 'keep' ? reservation.canKeep : reservation.canCancel);
  useEffect(() => {
    if (!reservation || !requested || !possible || prompted) return;
    actions.ask(requested, reservation);
    setPrompted(true);
  }, [reservation, requested, possible, prompted, actions]);

  return (
    <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-detail-page">
      <PageHeader title={t('detail.title')} backTo="/reservations" noMargin />
      {timezone && <TimezoneHint timezone={timezone} />}
      {(query.isError || !validId) && (
        <StatusAlert status="danger" title={t('detail.loadFailed')}>
          {validId ? describeError(query.error, t) : t('errors.RESERVATION_NOT_FOUND')}
        </StatusAlert>
      )}
      {validId && !query.isError && (!reservation || !timezone) && (
        <TableDataLoadingIndicator label={t('common.loading')} />
      )}
      {reservation && timezone && (
        <Card>
          <Card.Header>
            <Card.Title>{reservation.resourceName ?? `#${reservation.resourceId}`}</Card.Title>
            <Card.Description>{format.range(reservation.startTime, reservation.endTime)}</Card.Description>
          </Card.Header>
          <Card.Content className="rv:flex rv:flex-col rv:gap-3">
            <StatusChip status={reservation.status} />
            {reservation.userName && <p className="rv:text-sm">{t('detail.holder', { name: reservation.userName })}</p>}
            {reservation.note && <p className="rv:text-sm">{reservation.note}</p>}
            {/* Once the dialog was offered, a later change (e.g. after confirming) is no reason to warn. */}
            {requested && !possible && !prompted && (
              <StatusAlert status="warning">
                {requested === 'keep' ? t('detail.cannotKeep') : t('detail.cannotCancel')}
              </StatusAlert>
            )}
            <div className="rv:flex rv:flex-wrap rv:gap-2">
              {reservation.canKeep && (
                <Button variant="secondary" onPress={() => actions.ask('keep', reservation)}>
                  {t('actions.keep.label')}
                </Button>
              )}
              {reservation.canCancel && (
                <Button variant="secondary" onPress={() => actions.ask('cancel', reservation)}>
                  {t('actions.cancel.label')}
                </Button>
              )}
            </div>
          </Card.Content>
        </Card>
      )}
      {actions.dialogs}
    </div>
  );
}
