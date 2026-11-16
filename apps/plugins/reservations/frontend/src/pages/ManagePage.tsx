import { PageHeader, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useMemo, useState } from 'react';
import { ReservationsApiError, type ManageFilter } from '../api';
import { useReservationsTranslations } from '../i18n';
import { useManagedReservations, usePluginTimezone } from '../lib/queries';
import { addLocalDays, browserTimeZone, fromDateKey, startOfLocalDay } from '../lib/time';
import type { NamedEntity, ReservationStatus } from '../lib/types';
import { SelectField, TextInput } from '../shared/fields';
import { PagePagination } from '../shared/PagePagination';
import { listState } from '../shared/queryState';
import { ReservationsTable } from '../shared/ReservationsTable';
import { TimezoneHint } from '../shared/TimezoneHint';
import { useReservationActions } from '../shared/useReservationActions';
import { ResourceFilter } from './ResourceFilter';

const STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
  'no_show',
  'completed',
];
const ALL = 'all';

export function ManagePage() {
  const { t } = useReservationsTranslations();
  const timezone = usePluginTimezone();
  const zone = timezone ?? browserTimeZone();
  const actions = useReservationActions({ timezone });

  const [resource, setResource] = useState<NamedEntity | null>(null);
  const [status, setStatus] = useState(ALL);
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [page, setPage] = useState(1);

  const filter = useMemo<ManageFilter>(() => {
    const from = fromDateKey(fromKey);
    const to = fromDateKey(toKey);
    return {
      page,
      resourceId: resource?.id,
      status: status === ALL ? undefined : (status as ReservationStatus),
      from: from ? startOfLocalDay(from, zone).toISOString() : undefined,
      // The end date is inclusive: the range runs to the start of the next day.
      to: to ? startOfLocalDay(addLocalDays(to, 1), zone).toISOString() : undefined,
    };
  }, [page, resource, status, fromKey, toKey, zone]);

  const pending = useManagedReservations({ page: 1, status: 'pending' });
  const list = useManagedReservations(filter);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  // The unfiltered pending query is refused for users who manage no resource.
  if (pending.error instanceof ReservationsApiError && pending.error.status === 403) {
    return (
      <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-manage-denied">
        <PageHeader title={t('manage.title')} backTo="/reservations" noMargin />
        <StatusAlert status="warning" title={t('manage.denied')} />
      </div>
    );
  }

  return (
    <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-manage-page">
      <PageHeader title={t('manage.title')} subtitle={t('manage.subtitle')} backTo="/reservations" noMargin />
      {timezone && <TimezoneHint timezone={timezone} />}
      <Card>
        <Card.Header>
          <Card.Title>{t('manage.pending')}</Card.Title>
          <Card.Description>{t('manage.pendingHint')}</Card.Description>
        </Card.Header>
        <Card.Content>
          <ReservationsTable
            items={pending.data?.items ?? []}
            timezone={timezone}
            ariaLabel={t('manage.pending')}
            {...listState(pending, timezone)}
            showUser
            onAction={actions.ask}
          />
        </Card.Content>
      </Card>
      {/* Plain section: form fields do not belong on a Card surface. */}
      <section className="rv:flex rv:flex-col rv:gap-4" aria-labelledby="reservations-manage-all-title">
        <h2 id="reservations-manage-all-title" className="rv:text-base rv:font-semibold">
          {t('manage.all')}
        </h2>
        <div className="rv:grid rv:gap-3 rv:sm:grid-cols-2 rv:lg:grid-cols-4">
          <ResourceFilter value={resource} onChange={resetPage(setResource)} />
          <SelectField
            label={t('manage.filters.status')}
            value={status}
            onChange={resetPage(setStatus)}
            options={[
              { key: ALL, label: t('manage.filters.allStatuses') },
              ...STATUSES.map((entry) => ({ key: entry, label: t(`status.${entry}`) })),
            ]}
          />
          <TextInput label={t('manage.filters.from')} type="date" value={fromKey} onChange={resetPage(setFromKey)} />
          <TextInput label={t('manage.filters.to')} type="date" value={toKey} onChange={resetPage(setToKey)} />
        </div>
        <ReservationsTable
          items={list.data?.items ?? []}
          timezone={timezone}
          ariaLabel={t('manage.all')}
          {...listState(list, timezone)}
          showUser
          onAction={actions.ask}
        />
        <PagePagination page={page} total={totalPages} onChange={setPage} />
      </section>
      {actions.dialogs}
    </div>
  );
}
