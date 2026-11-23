import { useId, useState } from 'react';
import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ABSOLUTE_LIMIT_MINUTES, joinMinutes, splitMinutes } from '../../usage/sessionDuration';
import { EditorTabProps } from './props';
import en from '../resourceEditModal.en.json';
import de from '../resourceEditModal.de.json';

/** Max session time, required duration estimate and the default estimate of readers that cannot ask. Machines only. */
export function SessionDurationSettings({
  formData,
  setField,
}: Readonly<Pick<EditorTabProps, 'formData' | 'setField'>>) {
  const { t } = useTranslations({ en, de });
  const labelId = useId();
  const descriptionId = useId();
  const max = formData.maxSessionDurationMinutes ?? null;
  // Kept as typed, so the fields never show another value than the form holds; saving refuses it.
  const isMaxTooLong = max !== null && max > ABSOLUTE_LIMIT_MINUTES;
  const { hours, minutes } = splitMinutes(max ?? 0);
  // Lets the fields be emptied while typing; empty hours and minutes mean no limit.
  const [draft, setDraft] = useState<{ hours: string; minutes: string } | null>(null);
  const shownHours = draft?.hours ?? (max === null ? '' : String(hours));
  const shownMinutes = draft?.minutes ?? (max === null ? '' : String(minutes));

  const onChange = (raw: { hours: string; minutes: string }) => {
    // Digits only: a minus sign or exponent must not silently turn into "no limit".
    const next = { hours: raw.hours.replace(/\D/g, ''), minutes: raw.minutes.replace(/\D/g, '') };
    setDraft(next);
    const total = joinMinutes(Math.floor(Number(next.hours) || 0), Math.floor(Number(next.minutes) || 0));
    setField('maxSessionDurationMinutes', total <= 0 ? null : total);
    // The default estimate only applies without a maximum and its field is hidden while one is set, so a stale
    // value must not make the save fail for a reason the user cannot see.
    if (total > 0) setField('defaultSessionDurationEstimateMinutes', null);
  };

  const required = formData.requireSessionDurationEstimate === true;
  const defaultEstimate = formData.defaultSessionDurationEstimateMinutes ?? null;

  return (
    <div className="flex flex-col gap-2" data-cy="resource-edit-modal-session-duration">
      <div className="flex flex-col gap-1">
        <Label id={labelId}>{t('inputs.machine.sessionDuration.maxSessionTime.label')}</Label>
        <div className="flex gap-3" role="group" aria-labelledby={labelId}>
          <TextField
            value={shownHours}
            onChange={(value) => onChange({ hours: value, minutes: shownMinutes })}
            onBlur={() => setDraft(null)}
            isInvalid={isMaxTooLong}
            aria-describedby={descriptionId}
            className="min-w-0 flex-1"
          >
            <Label>{t('inputs.machine.sessionDuration.maxSessionTime.hours')}</Label>
            <Input type="number" min={0} data-cy="resource-edit-modal-max-session-hours" />
            {/* One message for both fields: the problem is their sum. */}
            <FieldError data-cy="resource-edit-modal-max-session-error">
              {t('inputs.machine.sessionDuration.maxSessionTime.tooLong')}
            </FieldError>
          </TextField>
          <TextField
            value={shownMinutes}
            onChange={(value) => onChange({ hours: shownHours, minutes: value })}
            onBlur={() => setDraft(null)}
            isInvalid={isMaxTooLong}
            aria-describedby={descriptionId}
            className="min-w-0 flex-1"
          >
            <Label>{t('inputs.machine.sessionDuration.maxSessionTime.minutes')}</Label>
            <Input type="number" min={0} data-cy="resource-edit-modal-max-session-minutes" />
          </TextField>
        </div>
        <Description id={descriptionId}>{t('inputs.machine.sessionDuration.maxSessionTime.description')}</Description>
      </div>

      <LabeledSwitch
        isSelected={required}
        onChange={(value) => setField('requireSessionDurationEstimate', value)}
        data-cy="resource-edit-modal-require-estimate-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.machine.sessionDuration.requireEstimate.label')}</span>
          <span className="text-tiny text-default-400">
            {t('inputs.machine.sessionDuration.requireEstimate.description')}
          </span>
        </div>
      </LabeledSwitch>

      {required && max === null && (
        <TextField
          value={defaultEstimate === null ? '' : String(defaultEstimate)}
          onChange={(value) => {
            const parsed = Math.floor(Number(value));
            setField(
              'defaultSessionDurationEstimateMinutes',
              value.trim() === '' || !(parsed > 0) ? null : Math.min(ABSOLUTE_LIMIT_MINUTES, parsed),
            );
          }}
          className="w-full"
        >
          <Label>{t('inputs.machine.sessionDuration.defaultEstimate.label')}</Label>
          <Input
            type="number"
            min={1}
            max={ABSOLUTE_LIMIT_MINUTES}
            data-cy="resource-edit-modal-default-estimate-input"
          />
          <Description>{t('inputs.machine.sessionDuration.defaultEstimate.description')}</Description>
        </TextField>
      )}
    </div>
  );
}
