import { Alert, AlertContent, AlertTitle, Button, Form, Input, Label, ListBoxItem, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Select, Switch, TextField, useOverlayState } from '@heroui/react';
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
  const { isOpen, open, setOpen, close } = useOverlayState();

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
    close();
  }, [queryClient, close]);

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
      {activator(open)}
      <Modal isOpen={isOpen} onOpenChange={setOpen}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {() => (<>
          <ModalHeader>
            <PageHeader
              icon={<CalendarClockIcon />}
              title={scheduleId != null ? t('titleEdit') : t('titleCreate')}
              noMargin
            />
          </ModalHeader>

          <ModalBody>
            <Form ref={formRef} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
              <TextField value={name} onChange={setName}>
                <Label>{t('inputs.name.label')}</Label>
                <Input placeholder="e.g. Monthly check" />
              </TextField>

              <Select
                label={t('inputs.triggerType.label')}

                onSelectionChange={(key) => {
                  const v = Array.from(key)[0] as ResourceMaintenanceScheduleTriggerType;
                  if (v) setTriggerType(v);
                }}
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <ListBoxItem key={opt.value} id={opt.value}>{t(`triggerType.${opt.labelKey}`)}</ListBoxItem>
                ))}
              </Select>

              {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && (
                <>
                  <TextField value={usageHoursDuration} onChange={setUsageHoursDuration} isRequired>
                    <Label>{t('inputs.duration.label')}</Label>
                    <Input type="number" min={1} />
                  </TextField>
                  <Select
                    label={t('inputs.unit.label')}

                    onSelectionChange={(key) => {
                      const v = Array.from(key)[0] as UsageDurationUnit;
                      if (v) setUsageHoursUnit(v);
                    }}
                  >
                    {Object.values(UsageDurationUnit).map((unit) => (
                      <ListBoxItem key={unit} id={unit}>{t(`inputs.unit.${unit}`)}</ListBoxItem>
                    ))}
                  </Select>
                </>
              )}

              {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT && (
                <TextField value={thresholdSessions} onChange={setThresholdSessions} isRequired>
                  <Label>{t('inputs.thresholdSessions.label')}</Label>
                  <Input type="number" min={1} />
                </TextField>
              )}

              {triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL && (
                <>
                  <TextField value={timeIntervalDuration} onChange={setTimeIntervalDuration}>
                    <Label>{t('inputs.duration.label')}</Label>
                    <Input type="number" min={1} placeholder="e.g. 30" />
                  </TextField>
                  <Select
                    label={t('inputs.unit.label')}

                    onSelectionChange={(key) => {
                      const v = Array.from(key)[0] as UsageDurationUnit;
                      if (v) setTimeIntervalUnit(v);
                    }}
                  >
                    {Object.values(UsageDurationUnit).map((unit) => (
                      <ListBoxItem key={unit} id={unit}>{t(`inputs.unit.${unit}`)}</ListBoxItem>
                    ))}
                  </Select>
                  <p className="text-sm text-default-500">{t('inputs.timeIntervalEvaluationNote')}</p>
                </>
              )}

              <Switch isSelected={enabled} onChange={setEnabled}>
                {t('inputs.enabled.label')}
              </Switch>

              {error && (
                <Alert status="danger">
                  <AlertContent>
                    <AlertTitle>{t('alert.error.title')}</AlertTitle>
                  </AlertContent>
                  {(error as Error).message}
                </Alert>
              )}

              <button type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button variant="primary"
              onPress={onSubmit}
              isPending={isCreating || isUpdating}
            >
              {t('actions.save')}
            </Button>
          </ModalFooter>
            </>)}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
