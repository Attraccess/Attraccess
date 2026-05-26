import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { Button } from '../../components/button';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useReliableServerAvailability } from '../../hooks/useReliableServerAvailability';
import { CloudOffIcon, RotateCwIcon } from 'lucide-react';

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
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-danger/10 border-b border-danger/30 px-4 py-2.5 flex flex-wrap items-center gap-3 animate-in slide-in-from-top duration-300"
    >
      <CloudOffIcon className="text-danger shrink-0" size={18} />
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm font-semibold text-foreground">{t('title')}</div>
        <div className="text-xs text-muted">{t('description')}</div>
      </div>
      <Button size="sm" variant="danger-soft" onPress={reload} isPending={isLoading}>
        <RotateCwIcon className="w-3.5 h-3.5" />
        {t('actions.reload')}
      </Button>
    </div>
  );
}
