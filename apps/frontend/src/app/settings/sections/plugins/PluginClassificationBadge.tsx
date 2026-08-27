import { Chip, Tooltip, TooltipContent } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export function PluginClassificationBadge({ classification }: { classification?: 'official' | 'community' }) {
  const { t } = useTranslations({ en, de });
  if (!classification) return null;
  const key = classification === 'official' ? 'official' : 'community';
  return (
    <Tooltip>
      <Chip
        variant="soft"
        color={classification === 'official' ? 'success' : 'default'}
        data-cy={`plugin-classification-${key}`}
      >
        {t(`classification.${key}.label`)}
      </Chip>
      <TooltipContent>{t(`classification.${key}.tooltip`)}</TooltipContent>
    </Tooltip>
  );
}
