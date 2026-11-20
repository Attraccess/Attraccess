import { AccordionBody, AccordionHeading, AccordionItem, AccordionPanel, AccordionTrigger, Chip } from '@heroui/react';
import { Button, ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ClockIcon, GaugeIcon, HashIcon, PencilIcon, TrashIcon } from 'lucide-react';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  useFindMaintenanceSchedulesKey,
  useUpdateMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { configSummary } from './config-summary';
import { OperatingTrackingReadiness, OperatingTrackingStatus } from '../operating-readiness';
import de from './de.json';
import en from './en.json';

interface Props {
  schedule: ResourceMaintenanceSchedule;
  resourceId: number;
  trackingReadiness: OperatingTrackingReadiness;
  onEdit: () => void;
  /** Runs after the user confirmed; the confirmation stays open while it runs and when it fails. */
  onDelete: () => unknown;
}

function TriggerIcon({ type }: { type: ResourceMaintenanceScheduleTriggerType }) {
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) return <GaugeIcon className="w-4 h-4" />;
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) return <HashIcon className="w-4 h-4" />;
  return <ClockIcon className="w-4 h-4" />;
}

export function ScheduleAccordionItem(props: Props) {
  const { schedule, resourceId, trackingReadiness, onEdit, onDelete } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { mutate: updateSchedule, isPending: isToggling } = useUpdateMaintenanceSchedule(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useFindMaintenanceSchedulesKey],
      });
    },
  });

  const displayName = schedule.name ?? t(`schedules.triggerType.${schedule.triggerType}`);

  const togglePause = () => {
    updateSchedule({ path: { resourceId, scheduleId: schedule.id }, body: { enabled: !schedule.enabled } });
  };

  return (
    <AccordionItem id={schedule.id}>
      <AccordionHeading>
        <AccordionTrigger>
          <div className="flex flex-wrap items-center gap-3 w-full">
            <TriggerIcon type={schedule.triggerType} />
            <span className="font-medium">{displayName}</span>
            <span className="text-default-500 text-sm ml-auto">{configSummary(schedule, t)}</span>
            {schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
              (schedule as { durationBasis?: string }).durationBasis === 'ATTRIBUTABLE_OPERATING_DURATION' && (
                <OperatingTrackingStatus readiness={trackingReadiness} />
              )}
            <Chip size="sm" color={schedule.enabled ? 'success' : 'warning'} variant="soft">
              {schedule.enabled ? t('schedules.status.on') : t('schedules.status.paused')}
            </Chip>
          </div>
        </AccordionTrigger>
      </AccordionHeading>
      <AccordionPanel>
        <AccordionBody>
          <div className="text-sm text-default-600 mb-3">
            {t(`schedules.triggerType.${schedule.triggerType}`)} · {configSummary(schedule, t)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onPress={onEdit}>
              <PencilIcon className="w-4 h-4" />
              {t('schedules.actions.edit')}
            </Button>
            <Button variant="ghost" onPress={togglePause} isPending={isToggling}>
              {schedule.enabled ? t('schedules.actions.pause') : t('schedules.actions.resume')}
            </Button>
            <ConfirmableButton
              label={t('schedules.actions.delete')}
              icon={<TrashIcon className="w-4 h-4" />}
              status="error"
              buttonProps={{ variant: 'danger-soft' }}
              confirm={{
                title: t('schedules.deleteConfirm', { name: displayName }),
                message: t('schedules.deleteMessage'),
              }}
              onConfirm={onDelete}
            />
          </div>
        </AccordionBody>
      </AccordionPanel>
    </AccordionItem>
  );
}
