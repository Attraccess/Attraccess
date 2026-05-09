import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { Alert, AlertContent, AlertTitle, Button } from '@heroui/react';
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

  if (!isServerLikelyDown) {
    return null;
  }

  return (
    <Alert status="danger"
      className="sticky top-6 z-50 m-6 mt-0 w-auto"
    >
      <AlertContent>
        <AlertTitle>{t('title')}</AlertTitle>
      </AlertContent>
      <p>{t('description')}</p>
      <Button onPress={reload} isPending={isLoading}>
        {t('actions.reload')}
      </Button>
    </Alert>
  );
}
