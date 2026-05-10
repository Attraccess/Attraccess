import { Alert, AlertContent, AlertDescription, AlertTitle, Button } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

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
    <div>
      <Alert status="warning">
        <AlertContent>
          <AlertTitle>{t('alert.title')}</AlertTitle>
          <AlertDescription>{t('alert.description')}</AlertDescription>
        </AlertContent>
        <Button variant="danger-soft" className="ml-4" onPress={onClearFilterAndSearch}>
          {t('alert.clear')}
        </Button>
      </Alert>
    </div>
  );
}
