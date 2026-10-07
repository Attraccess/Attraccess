// Reusable schedule form body for the maintenance hub drawer
// FEATURE: Maintenance Hub - schedule create/edit form without overlay state
import { Alert, AlertContent, AlertTitle, Form, Input, Label, TextField } from '@heroui/react';
import { Button } from '../../../../components/button';
import { Select } from '../../../../components/select';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { ResourceMaintenanceScheduleTriggerType, UsageDurationUnit } from '@attraccess/react-query-client';
import { OperatingTrackingNotice } from '../operating-readiness';
import { TRIGGER_OPTIONS } from './schedule-form.state';
import { DURATION_BASIS_OPTIONS } from './schedule-form.state';
import { Props } from './schedule-form.props';
import { useScheduleFormState } from './useScheduleFormState';

export function ScheduleForm(props: Props) {
  const {
    resourceId,
    supportsOperatingDuration,
    onCancel,
    t,
    formRef,
    name,
    setName,
    triggerType,
    setTriggerType,
    usageHoursDuration,
    setUsageHoursDuration,
    usageHoursUnit,
    setUsageHoursUnit,
    durationBasis,
    setDurationBasis,
    usesOperatingDuration,
    trackingReadiness,
    thresholdSessions,
    setThresholdSessions,
    timeIntervalDuration,
    setTimeIntervalDuration,
    timeIntervalUnit,
    setTimeIntervalUnit,
    enabled,
    setEnabled,
    isCreating,
    isUpdating,
    error,
    onSubmit,
  } = useScheduleFormState(props);

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <TextField value={name} onChange={setName}>
        <Label>{t('form.name.label')}</Label>
        <Input placeholder={t('form.name.placeholder')} />
      </TextField>

      <Select
        label={t('form.triggerType.label')}
        value={triggerType}
        onChange={(key) => {
          if (key) setTriggerType(key as ResourceMaintenanceScheduleTriggerType);
        }}
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
            onChange={(key) => {
              if (key) setUsageHoursUnit(key as UsageDurationUnit);
            }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
          <Select
            label={t('form.durationBasis.label')}
            value={supportsOperatingDuration ? durationBasis : 'SESSION_DURATION'}
            onChange={(key) => {
              if (key) setDurationBasis(key as typeof durationBasis);
            }}
            items={DURATION_BASIS_OPTIONS.filter(
              (option) => supportsOperatingDuration || option.value === 'SESSION_DURATION',
            ).map((option) => ({
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
            onChange={(key) => {
              if (key) setTimeIntervalUnit(key as UsageDurationUnit);
            }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
          <p className="text-sm text-default-500">{t('form.timeIntervalNote')}</p>
        </>
      )}

      {usesOperatingDuration && (
        <OperatingTrackingNotice resourceId={resourceId} readiness={trackingReadiness} schedule />
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
