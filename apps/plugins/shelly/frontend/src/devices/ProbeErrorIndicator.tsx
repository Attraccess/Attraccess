import { Button } from '@attraccess/plugins-frontend-ui';
import { Tooltip } from '@heroui/react';
import { TriangleAlertIcon } from 'lucide-react';
import { useShellyTranslations } from '../i18n';

export function ProbeErrorIndicator({ message }: { message: string }) {
  const { t } = useShellyTranslations();
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t('devices.probeError', { message })}
          className="sh:h-6 sh:w-6 sh:min-w-6 sh:text-warning"
          data-cy="shelly-device-probe-error"
        >
          <TriangleAlertIcon className="sh:h-4 sh:w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{t('devices.probeError', { message })}</Tooltip.Content>
    </Tooltip>
  );
}
