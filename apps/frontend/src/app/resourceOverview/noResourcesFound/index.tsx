import { Button } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PackageOpenIcon, RotateCcwIcon } from 'lucide-react';

import de from './de.json';
import en from './en.json';

interface Props {
  onClearFilterAndSearch: () => void;
}

export function NoResourcesFound(props: Props) {
  const { onClearFilterAndSearch } = props;
  const { t } = useTranslations({
    de,
    en,
  });
  return (
    <div className="w-full bg-surface border border-separator/40 rounded-3xl shadow-surface px-6 py-12 flex flex-col items-center text-center gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 text-warning">
        <PackageOpenIcon className="w-8 h-8" />
      </div>
      <div className="space-y-1 max-w-md">
        <h2 className="text-lg font-semibold text-foreground">{t('alert.title')}</h2>
        <p className="text-sm text-muted">{t('alert.description')}</p>
      </div>
      <Button variant="primary" onPress={onClearFilterAndSearch}>
        <RotateCcwIcon className="w-4 h-4" />
        {t('alert.clear')}
      </Button>
    </div>
  );
}
