import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { Alert, Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useReliableServerAvailability } from '../../hooks/useReliableServerAvailability';

export function ServerNotAvailable() {
  const { t } = useTranslations({
    de,
    en,
  });

  const { isServerLikelyDown } = useReliableServerAvailability({
    consecutiveErrorThreshold: 3,
    refetchIntervalMs: 5000,
  });

  const queryClient = useQueryClient();

  const [isVisible, setIsVisible] = useState(isServerLikelyDown);

  useEffect(() => {
    if (isVisible === !isServerLikelyDown) {
      queryClient.invalidateQueries();
    }
    setIsVisible(isServerLikelyDown);
  }, [isServerLikelyDown, isVisible, queryClient]);

  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await queryClient.invalidateQueries();
    setIsLoading(false);
  }, [queryClient]);

  return (
    <Alert
      className="sticky top-6 z-50 m-6 mt-0 w-auto"
      color="danger"
      title={t('title')}
      variant="faded"
      isVisible={isServerLikelyDown}
    >
      <p>{t('description')}</p>
      <Button onPress={reload} isLoading={isLoading}>
        {t('actions.reload')}
      </Button>
    </Alert>
  );
}
