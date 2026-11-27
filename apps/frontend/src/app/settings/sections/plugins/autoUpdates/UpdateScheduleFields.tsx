import {
  Checkbox,
  CheckboxGroup,
  Description,
  FieldError,
  Label,
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  TimeField,
} from '@heroui/react';
import { Time } from '@internationalized/date';
import { useState } from 'react';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { TimeZoneField } from './TimeZoneField';
import type { UpdatePolicyForm, UpdatePolicyFormErrors } from './updatePolicyForm';

/** ISO weekdays, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  form: UpdatePolicyForm;
  errors: UpdatePolicyFormErrors;
  onChange: (changes: Partial<UpdatePolicyForm>) => void;
  isDisabled: boolean;
}

/** When automatic updates may install and restart: weekdays, start time, duration and time zone. */
export function UpdateScheduleFields({ form, errors, onChange, isDisabled }: Props) {
  const { t } = usePluginsTranslations();
  // The time field keeps its last complete value while a segment is empty, but goes on showing the gap. Remounting it
  // when focus leaves makes it show the value that will be saved.
  const [startFieldKey, setStartFieldKey] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <CheckboxGroup
        value={form.weekdays.map(String)}
        onChange={(days) => onChange({ weekdays: days.map(Number).sort((left, right) => left - right) })}
        isDisabled={isDisabled}
        isInvalid={errors.weekdays}
        isRequired
      >
        <Label>{t('autoUpdates.weekdays')}</Label>
        <div className="flex flex-wrap gap-4">
          {WEEKDAYS.map((day) => (
            <Checkbox key={day} value={String(day)} data-cy={`plugins-auto-updates-weekday-${day}`}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t(`autoUpdates.weekday.${day}`)}
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
        {errors.weekdays ? <FieldError>{t('autoUpdates.weekdaysRequired')}</FieldError> : null}
      </CheckboxGroup>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TimeField
          key={startFieldKey}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setStartFieldKey((key) => key + 1);
          }}
          value={form.startMinute === null ? null : new Time(Math.floor(form.startMinute / 60), form.startMinute % 60)}
          onChange={(time) => onChange({ startMinute: time ? time.hour * 60 + time.minute : null })}
          hourCycle={24}
          // German would show 01:30 as "1:30", unlike the window text below.
          shouldForceLeadingZeros
          isDisabled={isDisabled}
          isInvalid={errors.startMinute}
          isRequired
          data-cy="plugins-auto-updates-start"
        >
          <Label>{t('autoUpdates.start')}</Label>
          <TimeField.Group>
            <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
          </TimeField.Group>
          {errors.startMinute ? <FieldError>{t('autoUpdates.startRequired')}</FieldError> : null}
        </TimeField>
        <NumberField
          // NaN is React Aria's empty field; `undefined` would make the field uncontrolled.
          value={form.durationMinutes ?? Number.NaN}
          onChange={(minutes) => onChange({ durationMinutes: Number.isNaN(minutes) ? null : minutes })}
          minValue={1}
          maxValue={1440}
          step={1}
          isDisabled={isDisabled}
          isInvalid={errors.durationMinutes}
          isRequired
          data-cy="plugins-auto-updates-duration"
        >
          <Label>{t('autoUpdates.duration')}</Label>
          <NumberFieldGroup>
            <NumberFieldInput />
          </NumberFieldGroup>
          <Description>{t('autoUpdates.durationHint')}</Description>
          {errors.durationMinutes ? <FieldError>{t('autoUpdates.durationInvalid')}</FieldError> : null}
        </NumberField>
        <TimeZoneField
          value={form.timeZone}
          onChange={(timeZone) => onChange({ timeZone })}
          isInvalid={Boolean(errors.timeZone)}
          isDisabled={isDisabled}
        />
      </div>
    </div>
  );
}
