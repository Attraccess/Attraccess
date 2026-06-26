import { useEffect, useRef } from 'react';
import { OpenAPI } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useAuth } from './useAuth';

async function persistLocale(locale: string): Promise<void> {
  await fetch(`${OpenAPI.BASE}/api/users/me/locale`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ locale }),
  });
}

export function useLocaleSync() {
  const { isAuthenticated } = useAuth();
  const language = useTranslationState((s) => s.language);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (lastSyncedRef.current === language) return;

    lastSyncedRef.current = language;
    persistLocale(language).catch(() => {
      // Non-critical: locale sync failure should not block the UI
    });
  }, [isAuthenticated, language]);
}
