import { Button, PageHeader, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useReservation, usePluginTimezone } from '../lib/queries';
import { useFormatters } from '../lib/useFormatters';
import { StatusChip } from '../shared/StatusChip';
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
  const requested = search.get('action');
  const timezone = usePluginTimezone();
  const format = useFormatters(timezone);
  const query = useReservation(id);
  const actions = useReservationActions({ timezone, onDone: () => navigate('/reservations') });
  const [prompted, setPrompted] = useState(false);

  const reservation = query.data;
  useEffect(() => {
    if (!reservation || prompted) return;
    if (requested === 'keep' && reservation.canKeep) actions.ask('keep', reservation);
    else if (requested === 'cancel' && reservation.canCancel) actions.ask('cancel', reservation);
    else return;
    setPrompted(true);
  }, [reservation, requested, prompted, actions]);

  return (
    <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-detail-page">
      <PageHeader title={t('detail.title')} backTo="/reservations" noMargin />
      {(query.isError || !validId) && (
        <StatusAlert status="danger" title={t('detail.loadFailed')}>
          {validId ? describeError(query.error, t) : t('errors.RESERVATION_NOT_FOUND')}
        </StatusAlert>
      )}
      {reservation && (
        <Card>
          <Card.Header>
            <Card.Title>{reservation.resourceName ?? `#${reservation.resourceId}`}</Card.Title>
            <Card.Description>{format.range(reservation.startTime, reservation.endTime)}</Card.Description>
          </Card.Header>
          <Card.Content className="rv:flex rv:flex-col rv:gap-3">
            <StatusChip status={reservation.status} />
            {reservation.userName && <p className="rv:text-sm">{t('detail.holder', { name: reservation.userName })}</p>}
            {reservation.note && <p className="rv:text-sm">{reservation.note}</p>}
            {requested && !prompted && (
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
