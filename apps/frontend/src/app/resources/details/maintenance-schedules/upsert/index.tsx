import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Button,
  Input,
  Switch,
  Form,
  Alert,
  Select,
  SelectItem,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
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
  const [thresholdMinutes, setThresholdMinutes] = useState<string>('6000');
  const [thresholdSessions, setThresholdSessions] = useState<string>('50');
  const [intervalDays, setIntervalDays] = useState<string>('');
  const [thresholdHours, setThresholdHours] = useState<string>('');
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
        setThresholdMinutes('6000');
        setThresholdSessions('50');
        setIntervalDays('');
        setThresholdHours('');
        setEnabled(true);
      }
      return;
    }
    setName(existingSchedule.name ?? '');
    setTriggerType(existingSchedule.triggerType);
    setEnabled(existingSchedule.enabled);
    setThresholdMinutes(
      existingSchedule.usageHoursConfig?.thresholdMinutes?.toString() ?? '6000'
    );
    setThresholdSessions(
      existingSchedule.usageCountConfig?.thresholdSessions?.toString() ?? '50'
    );
    setIntervalDays(
      existingSchedule.timeIntervalConfig?.intervalDays?.toString() ?? ''
    );
    setThresholdHours(
      existingSchedule.timeIntervalConfig?.thresholdHours?.toString() ?? ''
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
      const minutes = parseInt(thresholdMinutes, 10);
      if (Number.isNaN(minutes) || minutes < 1) return;
      if (scheduleId != null) {
        updateSchedule({
          resourceId,
          scheduleId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageHoursConfig: { thresholdMinutes: minutes },
            enabled,
          },
        });
      } else {
        createSchedule({
          resourceId,
          requestBody: {
            name: name || undefined,
            triggerType,
            usageHoursConfig: { thresholdMinutes: minutes },
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
      const days = intervalDays ? parseInt(intervalDays, 10) : undefined;
      const hours = thresholdHours ? parseFloat(thresholdHours) : undefined;
      const hasDays = days != null && !Number.isNaN(days) && days >= 1;
      const hasHours = hours != null && !Number.isNaN(hours) && hours > 0;
      if (hasDays === hasHours) return; // exactly one required
      const intervalDaysValue =
        hasDays && days != null && !Number.isNaN(days) ? days : undefined;
      const thresholdHoursValue =
        hasHours && hours != null && !Number.isNaN(hours) ? hours : undefined;
      const timeIntervalConfig = {
        intervalDays: intervalDaysValue,
        thresholdHours: thresholdHoursValue,
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
    thresholdMinutes,
    thresholdSessions,
    intervalDays,
    thresholdHours,
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
                  <SelectItem key={opt.value}>{t(`triggerType.${opt.labelKey}`)}</SelectItem>
                ))}
              </Select>

              {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && (
                <Input
                  type="number"
                  label={t('inputs.thresholdMinutes.label')}
                  value={thresholdMinutes}
                  onValueChange={setThresholdMinutes}
                  min={1}
                  isRequired
                />
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
                    label={t('inputs.intervalDays.label')}
                    value={intervalDays}
                    onValueChange={setIntervalDays}
                    min={1}
                    placeholder="e.g. 30"
                  />
                  <Input
                    type="number"
                    label={t('inputs.thresholdHours.label')}
                    value={thresholdHours}
                    onValueChange={setThresholdHours}
                    min={0.01}
                    step={0.01}
                    placeholder="e.g. 500"
                  />
                  <p className="text-sm text-default-500">
                    Set either interval (days) or hours since last maintenance, not both.
                  </p>
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
