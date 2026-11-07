import { Button, StandardModal, StatusAlert, StatusDialog } from '@attraccess/plugins-frontend-ui';
import {
  Label,
  ModalBody,
  ModalCloseTrigger,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
} from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createReservation } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useAvailability, useInvalidateReservations } from '../lib/queries';
import { validDurations, validStarts } from '../lib/slots';
import { addLocalDays, fromDateKey, localDateOf, startOfLocalDay, toDateKey } from '../lib/time';
import type { Availability, Reservation } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { SelectField, TextInput } from '../shared/fields';
import { CheckInRules } from './CheckInRules';

interface Props {
  resourceId: number;
  resourceName?: string;
  availability: Availability;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: (reservation: Reservation) => void;
}

export function BookingModal(props: Readonly<Props>) {
  const { resourceId, availability, isOpen, onOpenChange, onBooked } = props;
  const { t } = useReservationsTranslations();
  const format = useFormatters(availability.timezone);
  const invalidate = useInvalidateReservations();
  const zone = availability.timezone;

  const today = () => toDateKey(localDateOf(new Date(), zone));
  const [dateKey, setDateKey] = useState(today);
  const [startIso, setStartIso] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => fromDateKey(dateKey), [dateKey]);
  // The chosen day plus a day either side, so buffers and neighbouring bookings are known.
  const range = useMemo(() => {
    const base = day ?? localDateOf(new Date(), zone);
    return { from: startOfLocalDay(addLocalDays(base, -1), zone), to: startOfLocalDay(addLocalDays(base, 2), zone) };
  }, [day, zone]);
  const dayAvailability = useAvailability(resourceId, range.from, range.to, isOpen && day !== null);

  const context = useMemo(
    () => ({
      rules: availability.rules,
      timezone: zone,
      reservations: dayAvailability.data?.reservations ?? [],
      maintenance: dayAvailability.data?.maintenance ?? [],
      now: new Date(),
    }),
    [availability.rules, zone, dayAvailability.data],
  );

  const starts = useMemo(
    () => (day && dayAvailability.data ? validStarts(context, day) : []),
    [context, day, dayAvailability.data],
  );
  const selectedStart = starts.find((start) => start.toISOString() === startIso) ?? null;
  const durations = useMemo(
    () => (selectedStart ? validDurations(context, selectedStart) : []),
    [context, selectedStart],
  );
  const durationValue = durations.includes(Number(duration)) ? duration : '';

  // Every way of closing (Escape, X, Cancel, success) starts the next opening from a clean form.
  const setOpen = (open: boolean) => {
    if (!open) {
      setDateKey(today());
      setStartIso('');
      setDuration('');
      setNote('');
    }
    onOpenChange(open);
  };

  const mutation = useMutation({
    mutationFn: () =>
      createReservation({
        resourceId,
        startTime: selectedStart?.toISOString() ?? '',
        durationMinutes: Number(durationValue),
        note: note.trim() || undefined,
      }),
    onSuccess: async (reservation) => {
      await invalidate();
      onBooked(reservation);
      setOpen(false);
    },
    onError: (failure) => {
      setError(describeError(failure, t));
      void invalidate();
    },
  });

  const rules = availability.rules;
  const canSubmit = selectedStart !== null && durationValue !== '' && !mutation.isPending;
  const noStarts = day !== null && dayAvailability.data !== undefined && starts.length === 0;

  return (
    <>
      <StandardModal isOpen={isOpen} onOpenChange={setOpen} size="md" data-cy="reservations-booking-modal">
        <ModalCloseTrigger aria-label={t('common.close')} />
        <ModalHeader>
          <ModalHeading>
            {props.resourceName ? t('booking.title', { resource: props.resourceName }) : t('booking.titleGeneric')}
          </ModalHeading>
        </ModalHeader>
        <ModalBody className="rv:flex rv:flex-col rv:gap-4 rv:p-1">
          <TextInput
            label={t('booking.date')}
            type="date"
            value={dateKey}
            onChange={(value) => {
              setDateKey(value);
              setStartIso('');
              setDuration('');
            }}
            description={t('booking.timezoneHint', { timezone: zone })}
            data-cy="reservations-booking-date"
          />
          <SelectField
            label={t('booking.start')}
            value={selectedStart ? startIso : ''}
            onChange={(value) => {
              setStartIso(value);
              setDuration('');
            }}
            options={starts.map((start) => ({ key: start.toISOString(), label: format.time(start) }))}
            isDisabled={starts.length === 0}
            data-cy="reservations-booking-start"
          />
          {noStarts && <StatusAlert status="warning">{t('booking.noSlots')}</StatusAlert>}
          <SelectField
            label={t('booking.duration')}
            value={durationValue}
            onChange={setDuration}
            options={durations.map((minutes) => ({ key: String(minutes), label: format.duration(minutes) }))}
            isDisabled={durations.length === 0}
            description={t('booking.durationHint', {
              step: rules.timeStepMinutes,
              min: format.duration(rules.minDurationMinutes),
              max: format.duration(rules.maxDurationMinutes),
            })}
            data-cy="reservations-booking-duration"
          />
          <TextField value={note} onChange={setNote}>
            <Label>{t('booking.note')}</Label>
            <TextArea maxLength={500} rows={2} />
          </TextField>
          {rules.approvalRequired ? (
            <StatusAlert status="accent">{t('booking.approvalNeeded')}</StatusAlert>
          ) : (
            <p className="rv:text-sm rv:text-muted" data-cy="reservations-booking-instant">
              {t('booking.instantNote')}
            </p>
          )}
          <CheckInRules rules={rules} />
        </ModalBody>
        <ModalFooter>
          <Button variant="tertiary" onPress={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!canSubmit}
            isPending={mutation.isPending}
            onPress={() => mutation.mutate()}
            data-cy="reservations-booking-submit"
          >
            {rules.approvalRequired ? t('booking.requestSubmit') : t('booking.submit')}
          </Button>
        </ModalFooter>
      </StandardModal>
      <StatusDialog
        isOpen={error !== null}
        onClose={() => setError(null)}
        status="error"
        title={t('booking.failedTitle')}
        data-cy="reservations-booking-error"
      >
        {error ?? ''}
      </StatusDialog>
    </>
  );
}
