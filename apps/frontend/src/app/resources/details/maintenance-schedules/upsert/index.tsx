import { ModalBody, ModalFooter, ModalHeader, Button, Input, Switch, Form, Alert, Select } from "@heroui/react";
import { SelectItem } from "../../../../../utils/heroui-compat";
import { Modal, ModalContent, useDisclosure } from '../../../../../utils/heroui-compat';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
  UsageDurationUnit
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../../../components/pageHeader';
import { CalendarClockIcon } from 'lucide-react';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  scheduleId?: number;
  children: (onOpen: () => void) => React.ReactNode;
}

const TRIGGER_OPTIONS = [
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS, labelKey: 'USAGE_HOURS' },
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, labelKey: 'USAGE_COUNT' },
  { value: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL, labelKey: 'TIME_INTERVAL' },
] as const;

export function MaintenanceScheduleUpsertModal(props: Props) {
  const { resourceId, scheduleId, children: activator } = props;
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const { t } = useTranslations({ de, en });

  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<ResourceMaintenanceScheduleTriggerType>(
    ResourceMaintenanceScheduleTriggerType.USAGE_HOURS
  );
  const [usageHoursDuration, setUsageHoursDuration] = useState<string>('100');
  const [usageHoursUnit, setUsageHoursUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [thresholdSessions, setThresholdSessions] = useState<string>('50');
  const [timeIntervalDuration, setTimeIntervalDuration] = useState<string>('500');
  const [timeIntervalUnit, setTimeIntervalUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [enabled, setEnabled] = useState(true);

  const { data: existingSchedule } = useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule(
    { resourceId, scheduleId: scheduleId ?? 0 },
    undefined,
    { enabled: isOpen && scheduleId != null }
  );

  useEffect(() => {
    if (!existingSchedule) {
      if (!scheduleId) {
        setName('');
        setTriggerType(ResourceMaintenanceScheduleTriggerType.USAGE_HOURS);
        setUsageHoursDuration('100');
        setUsageHoursUnit(UsageDurationUnit.HOURS);
        setThresholdSessions('50');
        setTimeIntervalDuration('500');
        setTimeIntervalUnit(UsageDurationUnit.HOURS);
        setEnabled(true);
      }
      return;
    }
    setName(existingSchedule.name ?? '');
    setTriggerType(existingSchedule.triggerType);
    setEnabled(existingSchedule.enabled);
    setUsageHoursDuration(
      existingSchedule.usageHoursConfig?.duration?.toString() ?? '100'
    );
    setUsageHoursUnit(
      existingSchedule.usageHoursConfig?.unit ?? UsageDurationUnit.HOURS
    );
    setThresholdSessions(
      existingSchedule.usageCountConfig?.thresholdSessions?.toString() ?? '50'
    );
    setTimeIntervalDuration(
      existingSchedule.timeIntervalConfig?.duration?.toString() ?? '500'
    );
    setTimeIntervalUnit(
      (existingSchedule.timeIntervalConfig?.unit as UsageDurationUnit) ?? UsageDurationUnit.HOURS
    );
  }, [existingSchedule, scheduleId, isOpen]);

  const onSaveSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
    });
    onClose();
  }, [queryClient, onClose]);

  const { mutate: createSchedule, isPending: isCreating, error: createError } =
    useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule({
      onSuccess: onSaveSuccess,
    });

  const { mutate: updateSchedule, isPending: isUpdating, error: updateError } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({
      onSuccess: onSaveSuccess,
    });

  const error = (createError ?? updateError) as Error | undefined;

  const onSubmit = useCallback(() => {
    const valid = formRef.current?.reportValidity();
    if (!valid) return;

    if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
      const duration = parseInt(usageHoursDuration, 10);
      if (Number.isNaN(duration) || duration < 1) return;
      const usageHoursConfig = { duration, unit: usageHoursUnit };
      if (scheduleId != null) {
        updateSchedule({
          resourceId,
          scheduleId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageHoursConfig,
            enabled,
          },
        });
      } else {
        createSchedule({
          resourceId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageHoursConfig,
            enabled,
          },
        });
      }
      return;
    }

    if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
      const sessions = parseInt(thresholdSessions, 10);
      if (Number.isNaN(sessions) || sessions < 1) return;
      if (scheduleId != null) {
        updateSchedule({
          resourceId,
          scheduleId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageCountConfig: { thresholdSessions: sessions },
            enabled,
          },
        });
      } else {
        createSchedule({
          resourceId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageCountConfig: { thresholdSessions: sessions },
            enabled,
          },
        });
      }
      return;
    }

    if (triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL) {
      const duration = parseInt(timeIntervalDuration, 10);
      if (Number.isNaN(duration) || duration < 1) return;
      const timeIntervalConfig = {
        duration,
        unit: timeIntervalUnit,
      };
      if (scheduleId != null) {
        updateSchedule({
          resourceId,
          scheduleId,
          requestBody: {
            name: name || undefined,
            triggerType,
            timeIntervalConfig,
            enabled,
          },
        });
      } else {
        createSchedule({
          resourceId,
          requestBody: {
            name: name || undefined,
            triggerType,
            timeIntervalConfig,
            enabled,
          },
        });
      }
    }
  }, [
    name,
    triggerType,
    usageHoursDuration,
    usageHoursUnit,
    thresholdSessions,
    timeIntervalDuration,
    timeIntervalUnit,
    enabled,
    resourceId,
    scheduleId,
    createSchedule,
    updateSchedule,
  ]);

  return (
    <>
      {activator(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              icon={<CalendarClockIcon />}
              title={scheduleId != null ? t('titleEdit') : t('titleCreate')}
              noMargin
            />
          </ModalHeader>

          <ModalBody>
            <Form ref={formRef} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
              <Input
                label={t('inputs.name.label')}
                value={name}
                onValueChange={setName}
                placeholder="e.g. Monthly check"
              />

              <Select
                label={t('inputs.triggerType.label')}
                selectedKeys={[triggerType]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as ResourceMaintenanceScheduleTriggerType;
                  if (v) setTriggerType(v);
                }}
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} id={opt.value}>{t(`triggerType.${opt.labelKey}`)}</SelectItem>
                ))}
              </Select>

              {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && (
                <>
                  <Input
                    type="number"
                    label={t('inputs.duration.label')}
                    value={usageHoursDuration}
                    onValueChange={setUsageHoursDuration}
                    min={1}
                    isRequired
                  />
                  <Select
                    label={t('inputs.unit.label')}
                    selectedKeys={[usageHoursUnit]}
                    onSelectionChange={(keys) => {
                      const v = Array.from(keys)[0] as UsageDurationUnit;
                      if (v) setUsageHoursUnit(v);
                    }}
                  >
                    {Object.values(UsageDurationUnit).map((unit) => (
                      <SelectItem key={unit} id={unit}>{t(`inputs.unit.${unit}`)}</SelectItem>
                    ))}
                  </Select>
                </>
              )}

              {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT && (
                <Input
                  type="number"
                  label={t('inputs.thresholdSessions.label')}
                  value={thresholdSessions}
                  onValueChange={setThresholdSessions}
                  min={1}
                  isRequired
                />
              )}

              {triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL && (
                <>
                  <Input
                    type="number"
                    label={t('inputs.duration.label')}
                    value={timeIntervalDuration}
                    onValueChange={setTimeIntervalDuration}
                    min={1}
                    placeholder="e.g. 30"
                  />
                  <Select
                    label={t('inputs.unit.label')}
                    selectedKeys={[timeIntervalUnit]}
                    onSelectionChange={(keys) => {
                      const v = Array.from(keys)[0] as UsageDurationUnit;
                      if (v) setTimeIntervalUnit(v);
                    }}
                  >
                    {Object.values(UsageDurationUnit).map((unit) => (
                      <SelectItem key={unit} id={unit}>{t(`inputs.unit.${unit}`)}</SelectItem>
                    ))}
                  </Select>
                  <p className="text-sm text-default-500">{t('inputs.timeIntervalEvaluationNote')}</p>
                </>
              )}

              <Switch isSelected={enabled} onValueChange={setEnabled}>
                {t('inputs.enabled.label')}
              </Switch>

              {error && (
                <Alert color="danger" title={t('alert.error.title')} variant="flat">
                  {(error as Error).message}
                </Alert>
              )}

              <button type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button
              onPress={onSubmit}
              color="primary"
              isLoading={isCreating || isUpdating}
            >
              {t('actions.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
