import { useState } from 'react';
import { Description, Input, Label, TextField } from '@heroui/react';
import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { joinMinutes, splitMinutes } from '../../usage/sessionDuration';
import { EditorTabProps } from './props';
import en from '../resourceEditModal.en.json';
import de from '../resourceEditModal.de.json';

const MAX_MINUTES = 43_200;

/** Max session time, required duration estimate and the default estimate of readers that cannot ask. Machines only. */
export function SessionDurationSettings({
  formData,
  setField,
}: Readonly<Pick<EditorTabProps, 'formData' | 'setField'>>) {
  const { t } = useTranslations({ en, de });
  const max = formData.maxSessionDurationMinutes ?? null;
  const { hours, minutes } = splitMinutes(max ?? 0);
  // Lets the fields be emptied while typing; empty hours and minutes mean no limit.
  const [draft, setDraft] = useState<{ hours: string; minutes: string } | null>(null);
  const shownHours = draft?.hours ?? (max === null ? '' : String(hours));
  const shownMinutes = draft?.minutes ?? (max === null ? '' : String(minutes));

  const onChange = (next: { hours: string; minutes: string }) => {
    setDraft(next);
    const total = joinMinutes(Math.floor(Number(next.hours) || 0), Math.floor(Number(next.minutes) || 0));
    setField('maxSessionDurationMinutes', total <= 0 ? null : Math.min(MAX_MINUTES, total));
  };

  const required = formData.requireSessionDurationEstimate === true;
  const defaultEstimate = formData.defaultSessionDurationEstimateMinutes ?? null;

  return (
    <div className="flex flex-col gap-2" data-cy="resource-edit-modal-session-duration">
      <div className="flex flex-col gap-1">
        <span className="text-small font-medium">{t('inputs.machine.sessionDuration.maxSessionTime.label')}</span>
        <div className="flex gap-3" role="group">
          <TextField
            value={shownHours}
            onChange={(value) => onChange({ hours: value, minutes: shownMinutes })}
            onBlur={() => setDraft(null)}
            className="w-full"
          >
            <Label>{t('inputs.machine.sessionDuration.maxSessionTime.hours')}</Label>
            <Input type="number" min={0} data-cy="resource-edit-modal-max-session-hours" />
          </TextField>
          <TextField
            value={shownMinutes}
            onChange={(value) => onChange({ hours: shownHours, minutes: value })}
            onBlur={() => setDraft(null)}
            className="w-full"
          >
            <Label>{t('inputs.machine.sessionDuration.maxSessionTime.minutes')}</Label>
            <Input type="number" min={0} data-cy="resource-edit-modal-max-session-minutes" />
          </TextField>
        </div>
        <span className="text-tiny text-default-400">
          {t('inputs.machine.sessionDuration.maxSessionTime.description')}
        </span>
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
              value.trim() === '' || !(parsed > 0) ? null : Math.min(MAX_MINUTES, parsed),
            );
          }}
          className="w-full"
        >
          <Label>{t('inputs.machine.sessionDuration.defaultEstimate.label')}</Label>
          <Input type="number" min={1} max={MAX_MINUTES} data-cy="resource-edit-modal-default-estimate-input" />
          <Description>{t('inputs.machine.sessionDuration.defaultEstimate.description')}</Description>
        </TextField>
      )}
    </div>
  );
}
