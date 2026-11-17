import { Button, EmptyState } from '@attraccess/plugins-frontend-ui';
import { PlusIcon } from 'lucide-react';
import { useShellyTranslations } from '../i18n';

export function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:items-center sh:justify-center sh:gap-3 sh:pb-6">
      <EmptyState message={t('devices.empty')} />
      <Button variant="secondary" size="sm" onPress={onAdd} data-cy="shelly-add-open-empty">
        <PlusIcon className="sh:h-4 sh:w-4" /> {t('devices.add')}
      </Button>
    </div>
  );
}
