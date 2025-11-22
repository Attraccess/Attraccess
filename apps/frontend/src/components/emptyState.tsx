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
    <div className="flex flex-col justify-center items-center p-4">
      <MehIcon size={48} />
      <p>{message ?? t('message')}</p>
    </div>
  );
}
