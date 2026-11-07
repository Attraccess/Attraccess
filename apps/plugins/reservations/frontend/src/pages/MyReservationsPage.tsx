import { PageHeader } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { Link } from 'react-router-dom';
import { useReservationsTranslations } from '../i18n';
import { useIsManagerAnywhere, useMyReservations, usePluginTimezone } from '../lib/queries';
import { IcalFeeds } from '../ical/IcalFeeds';
import { listState } from '../shared/queryState';
import { ReservationsTable } from '../shared/ReservationsTable';
import { useReservationActions } from '../shared/useReservationActions';

export function MyReservationsPage() {
  const { t } = useReservationsTranslations();
  const timezone = usePluginTimezone();
  const upcoming = useMyReservations('upcoming');
  const past = useMyReservations('past');
  const actions = useReservationActions({ timezone });
  const manager = useIsManagerAnywhere();

  return (
    <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-my-page">
      <PageHeader title={t('my.title')} subtitle={t('my.subtitle')} noMargin />
      {manager && (
        <Link to="/reservations/manage" className="rv:text-sm rv:underline">
          {t('my.manageLink')}
        </Link>
      )}
      <Card>
        <Card.Header>
          <Card.Title>{t('my.upcoming')}</Card.Title>
        </Card.Header>
        <Card.Content>
          <ReservationsTable
            items={upcoming.data ?? []}
            timezone={timezone}
            ariaLabel={t('my.upcoming')}
            {...listState(upcoming)}
            onAction={actions.ask}
          />
        </Card.Content>
      </Card>
      <Card>
        <Card.Header>
          <Card.Title>{t('my.past')}</Card.Title>
        </Card.Header>
        <Card.Content>
          <ReservationsTable
            items={past.data ?? []}
            timezone={timezone}
            ariaLabel={t('my.past')}
            {...listState(past)}
            onAction={actions.ask}
          />
        </Card.Content>
      </Card>
      <Card data-cy="reservations-my-feeds">
        <Card.Header>
          <Card.Title>{t('feeds.title')}</Card.Title>
        </Card.Header>
        <Card.Content>
          <IcalFeeds />
        </Card.Content>
      </Card>
      {actions.dialogs}
    </div>
  );
}
