import { MehIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

interface Props {
  message?: string;
}

export function EmptyState(props: Props) {
  const { message } = props;

  const { t } = useTranslations({
    en: {
      message: 'No entries found',
    },
    de: {
      message: 'Keine Einträge gefunden',
    },
  });

  return (
    <div className="flex flex-col justify-center items-center py-6 px-4 gap-2">
      <MehIcon size={36} className="text-default-300" />
      <p className="text-sm text-default-500">{message ?? t('message')}</p>
    </div>
  );
}
