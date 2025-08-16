import { Alert, Button } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

interface Props {
  onClearFilterAndSearch: () => void;
}

export function NoResourcesFound(props: Props) {
  const { onClearFilterAndSearch } = props;
  const { t } = useTranslations('resourceOverview.noResourcesFound', {
    de,
    en,
  });
  return (
    <div>
      <Alert
        variant="faded"
        color="warning"
        title={t('alert.title')}
        description={t('alert.description')}
        endContent={
          <Button className="ml-4" onPress={onClearFilterAndSearch} size="sm" variant="flat" color="danger">
            {t('alert.clear')}
          </Button>
        }
      />
    </div>
  );
}
