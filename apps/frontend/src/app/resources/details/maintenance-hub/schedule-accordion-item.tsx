import {
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Chip,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ClockIcon, GaugeIcon, HashIcon, PencilIcon, TrashIcon } from 'lucide-react';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { configSummary } from './config-summary';
import de from './de.json';
import en from './en.json';

interface Props {
  schedule: ResourceMaintenanceSchedule;
  resourceId: number;
  onEdit: () => void;
  onDelete: () => void;
}

function TriggerIcon({ type }: { type: ResourceMaintenanceScheduleTriggerType }) {
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) return <GaugeIcon className="w-4 h-4" />;
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) return <HashIcon className="w-4 h-4" />;
  return <ClockIcon className="w-4 h-4" />;
}

export function ScheduleAccordionItem(props: Props) {
  const { schedule, resourceId, onEdit, onDelete } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { mutate: updateSchedule, isPending: isToggling } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
        });
      },
    });

  const togglePause = () => {
    updateSchedule({ resourceId, scheduleId: schedule.id, requestBody: { enabled: !schedule.enabled } });
  };

  return (
    <AccordionItem id={schedule.id}>
      <AccordionHeading>
        <AccordionTrigger>
          <div className="flex items-center gap-3 w-full">
            <TriggerIcon type={schedule.triggerType} />
            <span className="font-medium">{schedule.name ?? t(`schedules.triggerType.${schedule.triggerType}`)}</span>
            <span className="text-default-500 text-sm ml-auto">{configSummary(schedule, t)}</span>
            <Chip
              size="sm"
              color={schedule.enabled ? 'success' : 'warning'}
              variant="soft"
            >
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
          <div className="flex gap-2">
            <Button variant="ghost" onPress={onEdit}>
              <PencilIcon className="w-4 h-4" />
              {t('schedules.actions.edit')}
            </Button>
            <Button variant="ghost" onPress={togglePause} isPending={isToggling}>
              {schedule.enabled ? t('schedules.actions.pause') : t('schedules.actions.resume')}
            </Button>
            <Button variant="danger-soft" onPress={onDelete}>
              <TrashIcon className="w-4 h-4" />
              {t('schedules.actions.delete')}
            </Button>
          </div>
        </AccordionBody>
      </AccordionPanel>
    </AccordionItem>
  );
}
