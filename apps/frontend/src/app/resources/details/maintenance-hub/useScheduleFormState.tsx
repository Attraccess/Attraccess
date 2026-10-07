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
import { useOperatingTrackingReadiness } from '../operating-readiness';
import de from './de.json';
import en from './en.json';
import { DURATION_BASIS_OPTIONS } from './schedule-form.state';
import { Props } from './schedule-form.props';
export function useScheduleFormState(props: Props) {
  const { resourceId, supportsOperatingDuration, scheduleId, onSaved, onCancel } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<ResourceMaintenanceScheduleTriggerType>(
    ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
  );
  const [usageHoursDuration, setUsageHoursDuration] = useState('100');
  const [usageHoursUnit, setUsageHoursUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [durationBasis, setDurationBasis] =
    useState<(typeof DURATION_BASIS_OPTIONS)[number]['value']>('SESSION_DURATION');
  const usesOperatingDuration =
    supportsOperatingDuration &&
    triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
    durationBasis === 'ATTRIBUTABLE_OPERATING_DURATION';
  const trackingReadiness = useOperatingTrackingReadiness(resourceId, usesOperatingDuration);
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
      (existing as { durationBasis?: (typeof DURATION_BASIS_OPTIONS)[number]['value'] }).durationBasis ??
        'SESSION_DURATION',
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

  const {
    mutate: create,
    isPending: isCreating,
    error: createError,
  } = useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule({ onSuccess: onDone });
  const {
    mutate: update,
    isPending: isUpdating,
    error: updateError,
  } = useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({ onSuccess: onDone });

  const error = (createError ?? updateError) as Error | undefined;

  const onSubmit = useCallback(() => {
    if (!formRef.current?.reportValidity()) return;

    const base = {
      name: name || undefined,
      triggerType,
      enabled,
      durationBasis: supportsOperatingDuration ? durationBasis : 'SESSION_DURATION',
    };
    const buildBody = () => {
      if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
        const duration = parseInt(usageHoursDuration, 10);
        if (Number.isNaN(duration) || duration < 1) return null;
        return { ...base, usageHoursConfig: { duration, unit: usageHoursUnit } };
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
    name,
    triggerType,
    usageHoursDuration,
    usageHoursUnit,
    durationBasis,
    supportsOperatingDuration,
    thresholdSessions,
    timeIntervalDuration,
    timeIntervalUnit,
    enabled,
    resourceId,
    scheduleId,
    create,
    update,
  ]);
  return {
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
  } as const;
}
