import { Button, Tooltip, TooltipContent } from '@heroui/react';
import { Download } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useInstallApp } from './useInstallApp';
import en from './en.json';
import de from './de.json';

/** Icon button for pages without the sidebar (sign-in and other unauthorized pages). */
export function InstallAppButton() {
  const { t } = useTranslations({ en, de });
  const { mode, install } = useInstallApp();
  if (!mode) return null;

  return (
    <Tooltip>
      <Button variant="ghost" isIconOnly aria-label={t('install')} onPress={install} data-cy="install-app-button">
        <Download aria-hidden />
      </Button>
      <TooltipContent>{t('installTooltip')}</TooltipContent>
    </Tooltip>
  );
}
