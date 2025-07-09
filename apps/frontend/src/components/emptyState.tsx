import { MehIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

export const EmptyState = () => {
  const { t } = useTranslations('emptyState', {
    en: {
      message: 'No entries found',
    },
    de: {
      message: 'Keine Einträge gefunden',
    },
  });
  return (
    <div className="flex flex-col justify-center items-center p-4">
      <MehIcon size={48} />
      <p>{t('message')}</p>
    </div>
  );
};
