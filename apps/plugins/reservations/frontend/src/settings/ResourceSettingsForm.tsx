import { Button, LabeledSwitch, StatusAlert, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ReservationsApiError, getFutureBookingsCount, getResourceSettings, updateResourceSettings } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useInvalidateReservations } from '../lib/queries';
import type { ResourceSettings, ResourceSettingsValues, WhoCanBook } from '../lib/types';
import { INTEGER_RANGES, validateSettingsForm } from '../lib/validation';
import { NumberInput, SelectField } from '../shared/fields';
import { BookableHoursEditor } from './BookableHoursEditor';

type NumericField = keyof typeof INTEGER_RANGES;

const toValues = (settings: ResourceSettings): ResourceSettingsValues => {
  const { resourceId: _resourceId, ...values } = settings;
  void _resourceId;
  return values;
};

/** Weekdays without ranges mean the same as absent ones, so they must not count as a change. */
const comparable = (values: ResourceSettingsValues) =>
  JSON.stringify({
    ...values,
    bookableHours: Object.fromEntries(
      Object.entries(values.bookableHours)
        .filter(([, ranges]) => ranges && ranges.length > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  });

const NUMBER_GROUPS: { title: string; fields: NumericField[] }[] = [
  {
    title: 'rules',
    fields: ['timeStepMinutes', 'minDurationMinutes', 'maxDurationMinutes', 'maxAdvanceDays', 'minLeadMinutes'],
  },
  { title: 'limits', fields: ['bufferBeforeMinutes', 'bufferAfterMinutes', 'maxActiveBookingsPerUser'] },
  {
    title: 'checkIn',
    fields: ['confirmWindowMinutes', 'checkInGraceMinutes', 'earlyCheckInMinutes', 'handoverReminderMinutes'],
  },
];

/** `resource.settings` slot. Renders nothing when the API says the user does not manage the resource. */
export function ResourceSettingsForm({ resourceId }: Readonly<{ resourceId: number }>) {
  const { t } = useReservationsTranslations();
  const invalidate = useInvalidateReservations();
  const query = useQuery({
    queryKey: ['reservations', 'settings', resourceId],
    queryFn: () => getResourceSettings(resourceId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [values, setValues] = useState<ResourceSettingsValues | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<number | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) setValues(toValues(query.data));
  }, [query.data]);

  const errors = useMemo(() => (values ? validateSettingsForm(values) : {}), [values]);
  const dirty = useMemo(
    () => Boolean(values && query.data && comparable(values) !== comparable(toValues(query.data))),
    [values, query.data],
  );

  const save = useMutation({
    mutationFn: (cancelFutureBookings?: boolean) =>
      updateResourceSettings(resourceId, { ...(values as ResourceSettingsValues), cancelFutureBookings }),
    onSuccess: async (result) => {
      setConfirmDisable(null);
      setValues(toValues(result.settings));
      setSuccess(result.cancelledBookings);
      await invalidate();
      await query.refetch();
    },
    onError: (failure) => {
      setConfirmDisable(null);
      if (failure instanceof ReservationsApiError && failure.code === 'FUTURE_BOOKINGS_EXIST') {
        setConfirmDisable(failure.count ?? 0);
        return;
      }
      setError(describeError(failure, t));
    },
  });

  const checkAndSave = async () => {
    if (!values || !query.data) return;
    if (query.data.enabled && !values.enabled) {
      try {
        const { count } = await getFutureBookingsCount(resourceId);
        if (count > 0) {
          setConfirmDisable(count);
          return;
        }
      } catch (failure) {
        setError(describeError(failure, t));
        return;
      }
    }
    save.mutate(undefined);
  };

  // Users who do not manage the resource get nothing at all; any other failure is shown with a retry.
  if (query.error instanceof ReservationsApiError && query.error.status === 403) return null;
  if (query.isError) {
    return (
      <div className="rv:flex rv:flex-col rv:items-start rv:gap-2" data-cy="reservations-settings-load-error">
        <StatusAlert status="danger" title={t('settings.loadFailed')}>
          {describeError(query.error, t)}
        </StatusAlert>
        <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  if (!values) return null;
  const set = <K extends keyof ResourceSettingsValues>(key: K, value: ResourceSettingsValues[K]) =>
    setValues({ ...values, [key]: value });
  const invalid = Object.keys(errors).length > 0;
  // The server still has reservations enabled after a cancelled warning, so the switch goes back on.
  const cancelDisable = () => {
    setConfirmDisable(null);
    setValues({ ...values, enabled: true });
  };
  const whoOptions: { key: WhoCanBook; label: string }[] = (['can-start', 'managers-only', 'any-user'] as const).map(
    (key) => ({ key, label: t(`settings.whoCanBook.${key}`) }),
  );

  return (
    <div className="rv:flex rv:flex-col rv:gap-6" data-cy="reservations-settings">
      <div className="rv:flex rv:flex-col rv:gap-3">
        <LabeledSwitch
          isSelected={values.enabled}
          onChange={(value) => set('enabled', value)}
          data-cy="reservations-setting-enabled"
        >
          {t('settings.enabled')}
        </LabeledSwitch>
        <LabeledSwitch isSelected={values.approvalRequired} onChange={(value) => set('approvalRequired', value)}>
          {t('settings.approvalRequired')}
        </LabeledSwitch>
        <SelectField
          label={t('settings.whoCanBook.label')}
          value={values.whoCanBook}
          onChange={(key) => set('whoCanBook', key as WhoCanBook)}
          options={whoOptions}
        />
        <LabeledSwitch isSelected={values.checkInEnabled} onChange={(value) => set('checkInEnabled', value)}>
          {t('settings.checkInEnabled')}
        </LabeledSwitch>
      </div>
      {NUMBER_GROUPS.map((group) => (
        <fieldset key={group.title} className="rv:flex rv:min-w-0 rv:flex-col rv:gap-3">
          <legend className="rv:mb-2 rv:text-sm rv:font-semibold">{t(`settings.groups.${group.title}`)}</legend>
          <div className="rv:grid rv:gap-4 rv:sm:grid-cols-2">
            {group.fields.map((field) => {
              const [min, max] = INTEGER_RANGES[field];
              const message = errors[field];
              return (
                <NumberInput
                  key={field}
                  label={t(`settings.fields.${field}`)}
                  value={values[field]}
                  onChange={(value) => set(field, value)}
                  min={min}
                  max={max}
                  description={t(`settings.hints.${field}`, { min, max })}
                  errorMessage={
                    message
                      ? t(`settings.validation.${message}`, { min, max, step: values.timeStepMinutes })
                      : undefined
                  }
                  data-cy={`reservations-setting-${field}`}
                />
              );
            })}
          </div>
        </fieldset>
      ))}
      <fieldset className="rv:flex rv:min-w-0 rv:flex-col rv:gap-3">
        <legend className="rv:mb-2 rv:text-sm rv:font-semibold">{t('settings.groups.hours')}</legend>
        <BookableHoursEditor
          value={values.bookableHours}
          onChange={(hours) => set('bookableHours', hours)}
          errors={errors}
        />
      </fieldset>
      <div>
        <Button
          variant="primary"
          isDisabled={invalid || !dirty}
          isPending={save.isPending}
          onPress={() => void checkAndSave()}
          data-cy="reservations-settings-save"
        >
          {t('common.save')}
        </Button>
      </div>
      <StatusDialog
        isOpen={confirmDisable !== null}
        onClose={cancelDisable}
        status="warning"
        title={t('settings.disableWarning.title')}
        action={{
          label: t('settings.disableWarning.confirm', { count: confirmDisable ?? 0 }),
          onPress: () => save.mutate(true),
          isPending: save.isPending,
        }}
        data-cy="reservations-disable-dialog"
      >
        {t('settings.disableWarning.body', { count: confirmDisable ?? 0 })}
      </StatusDialog>
      <StatusDialog
        isOpen={success !== null}
        onClose={() => setSuccess(null)}
        status="success"
        title={t('settings.saved.title')}
        data-cy="reservations-settings-saved"
      >
        {success ? t('settings.saved.bodyCancelled', { count: success }) : t('settings.saved.body')}
      </StatusDialog>
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('settings.failed')}>
        {error ?? ''}
      </StatusDialog>
    </div>
  );
}
