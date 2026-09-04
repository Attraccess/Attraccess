// Reusable schedule form body for the maintenance hub drawer
// FEATURE: Maintenance Hub - schedule create/edit form without overlay state
import {
  Alert,
  AlertContent,
  AlertTitle,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { Button } from '../../../../components/button';
import { Select } from '../../../../components/select';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
  UsageDurationUnit,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import de from './de.json';
import en from './en.json';

const TRIGGER_OPTIONS = [
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS, labelKey: 'USAGE_HOURS' },
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, labelKey: 'USAGE_COUNT' },
  { value: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL, labelKey: 'TIME_INTERVAL' },
] as const;

const DURATION_BASIS_OPTIONS = [
  { value: 'SESSION_DURATION', labelKey: 'SESSION_DURATION' },
  { value: 'ATTRIBUTABLE_OPERATING_DURATION', labelKey: 'ATTRIBUTABLE_OPERATING_DURATION' },
] as const;

interface Props {
  resourceId: number;
  scheduleId?: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function ScheduleForm(props: Props) {
  const { resourceId, scheduleId, onSaved, onCancel } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<ResourceMaintenanceScheduleTriggerType>(
    ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
  );
  const [usageHoursDuration, setUsageHoursDuration] = useState('100');
  const [usageHoursUnit, setUsageHoursUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [durationBasis, setDurationBasis] = useState<(typeof DURATION_BASIS_OPTIONS)[number]['value']>('SESSION_DURATION');
  const [thresholdSessions, setThresholdSessions] = useState('50');
  const [timeIntervalDuration, setTimeIntervalDuration] = useState('500');
  const [timeIntervalUnit, setTimeIntervalUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [enabled, setEnabled] = useState(true);

  const { data: existing } = useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule(
    { resourceId, scheduleId: scheduleId ?? 0 },
    undefined,
    { enabled: scheduleId != null },
  );

  useEffect(() => {
    if (!existing) return;
    setName(existing.name ?? '');
    setTriggerType(existing.triggerType);
    setEnabled(existing.enabled);
    setUsageHoursDuration(existing.usageHoursConfig?.duration?.toString() ?? '100');
    setUsageHoursUnit(existing.usageHoursConfig?.unit ?? UsageDurationUnit.HOURS);
    setDurationBasis(
      (existing as { durationBasis?: (typeof DURATION_BASIS_OPTIONS)[number]['value'] }).durationBasis ?? 'SESSION_DURATION',
    );
    setThresholdSessions(existing.usageCountConfig?.thresholdSessions?.toString() ?? '50');
    setTimeIntervalDuration(existing.timeIntervalConfig?.duration?.toString() ?? '500');
    setTimeIntervalUnit((existing.timeIntervalConfig?.unit as UsageDurationUnit) ?? UsageDurationUnit.HOURS);
  }, [existing]);

  const onDone = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
    });
    onSaved();
  }, [queryClient, onSaved]);

  const { mutate: create, isPending: isCreating, error: createError } =
    useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule({ onSuccess: onDone });
  const { mutate: update, isPending: isUpdating, error: updateError } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({ onSuccess: onDone });

  const error = (createError ?? updateError) as Error | undefined;

  const onSubmit = useCallback(() => {
    if (!formRef.current?.reportValidity()) return;

    const base = { name: name || undefined, triggerType, enabled };
    const buildBody = () => {
      if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
        const duration = parseInt(usageHoursDuration, 10);
        if (Number.isNaN(duration) || duration < 1) return null;
        return { ...base, durationBasis, usageHoursConfig: { duration, unit: usageHoursUnit } };
      }
      if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
        const sessions = parseInt(thresholdSessions, 10);
        if (Number.isNaN(sessions) || sessions < 1) return null;
        return { ...base, usageCountConfig: { thresholdSessions: sessions } };
      }
      const duration = parseInt(timeIntervalDuration, 10);
      if (Number.isNaN(duration) || duration < 1) return null;
      return { ...base, timeIntervalConfig: { duration, unit: timeIntervalUnit } };
    };

    const requestBody = buildBody();
    if (!requestBody) return;

    if (scheduleId != null) {
      update({ resourceId, scheduleId, requestBody: requestBody as never });
    } else {
      create({ resourceId, requestBody: requestBody as never });
    }
  }, [
    name, triggerType, usageHoursDuration, usageHoursUnit, durationBasis, thresholdSessions,
    timeIntervalDuration, timeIntervalUnit, enabled, resourceId, scheduleId, create, update,
  ]);

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex flex-col gap-4"
    >
      <TextField value={name} onChange={setName}>
        <Label>{t('form.name.label')}</Label>
        <Input placeholder={t('form.name.placeholder')} />
      </TextField>

      <Select
        label={t('form.triggerType.label')}
        value={triggerType}
        onChange={(key) => { if (key) setTriggerType(key as ResourceMaintenanceScheduleTriggerType); }}
        items={TRIGGER_OPTIONS.map((opt) => ({
          key: opt.value,
          label: t(`schedules.triggerType.${opt.labelKey}`),
        }))}
      />

      {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && (
        <>
          <TextField value={usageHoursDuration} onChange={setUsageHoursDuration} isRequired>
            <Label>{t('form.duration.label')}</Label>
            <Input type="number" min={1} />
          </TextField>
          <Select
            label={t('form.unit.label')}
            value={usageHoursUnit}
            onChange={(key) => { if (key) setUsageHoursUnit(key as UsageDurationUnit); }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
          <Select
            label={t('form.durationBasis.label')}
            value={durationBasis}
            onChange={(key) => { if (key) setDurationBasis(key as typeof durationBasis); }}
            items={DURATION_BASIS_OPTIONS.map((option) => ({
              key: option.value,
              label: t(`form.durationBasis.${option.labelKey}`),
            }))}
          />
        </>
      )}

      {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT && (
        <TextField value={thresholdSessions} onChange={setThresholdSessions} isRequired>
          <Label>{t('form.thresholdSessions.label')}</Label>
          <Input type="number" min={1} />
        </TextField>
      )}

      {triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL && (
        <>
          <TextField value={timeIntervalDuration} onChange={setTimeIntervalDuration} isRequired>
            <Label>{t('form.duration.label')}</Label>
            <Input type="number" min={1} />
          </TextField>
          <Select
            label={t('form.unit.label')}
            value={timeIntervalUnit}
            onChange={(key) => { if (key) setTimeIntervalUnit(key as UsageDurationUnit); }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
          <p className="text-sm text-default-500">{t('form.timeIntervalNote')}</p>
        </>
      )}

      <LabeledSwitch isSelected={enabled} onChange={setEnabled}>
        {t('form.enabled.label')}
      </LabeledSwitch>

      {error && (
        <Alert status="danger">
          <AlertContent>
            <AlertTitle>{t('form.alert.errorTitle')}</AlertTitle>
          </AlertContent>
          {error.message}
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onPress={onCancel} type="button">
          {t('form.actions.cancel')}
        </Button>
        <Button variant="primary" onPress={onSubmit} isPending={isCreating || isUpdating} type="button">
          {t('form.actions.save')}
        </Button>
      </div>

      <button type="submit" hidden />
    </Form>
  );
}
