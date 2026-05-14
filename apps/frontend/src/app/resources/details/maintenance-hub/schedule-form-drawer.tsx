import { DrawerHeader, DrawerBody } from '@heroui/react';
import { StandardDrawer } from '../../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ScheduleForm } from './schedule-form';
import { useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  scheduleId?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduleFormDrawer(props: Props) {
  const { resourceId, scheduleId, isOpen, onClose } = props;
  const { t } = useTranslations({ de, en });

  const { data: existing } = useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule(
    { resourceId, scheduleId: scheduleId ?? 0 },
    undefined,
    { enabled: isOpen && scheduleId != null },
  );

  const title =
    scheduleId != null
      ? t('form.titleEdit', { name: existing?.name ?? '…' })
      : t('form.titleCreate');

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      dialogProps={{ className: 'md:max-w-2xl md:mx-auto' }}
    >
      <DrawerHeader>
        <h2 className="text-lg font-semibold">{title}</h2>
      </DrawerHeader>
      <DrawerBody>
        {isOpen && (
          <ScheduleForm
            resourceId={resourceId}
            scheduleId={scheduleId}
            onSaved={onClose}
            onCancel={onClose}
          />
        )}
      </DrawerBody>
    </StandardDrawer>
  );
}
