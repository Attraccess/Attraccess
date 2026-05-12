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
    <div className="flex flex-col justify-center items-center py-12 px-4 gap-3">
      <MehIcon size={56} className="text-default-300" />
      <p className="text-default-500">{message ?? t('message')}</p>
    </div>
  );
}
