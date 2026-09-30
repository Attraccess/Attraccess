import { useEffect, useRef } from 'react';
import { useUsersServiceUpdateMyLocale } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useAuth } from './useAuth';

export function useLocaleSync() {
  const { isAuthenticated } = useAuth();
  const language = useTranslationState((s) => s.language);
  const lastSyncedRef = useRef<string | null>(null);
  const { mutate } = useUsersServiceUpdateMyLocale();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (lastSyncedRef.current === language) return;

    lastSyncedRef.current = language;
    mutate({ requestBody: { locale: language } });
  }, [isAuthenticated, language, mutate]);
}
