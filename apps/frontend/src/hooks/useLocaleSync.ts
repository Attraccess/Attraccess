import { useEffect, useRef } from 'react';
import {
  useSettingsServiceGetFirstTimeSetupStatus,
  useSettingsServiceGetSystemLanguage,
  useUsersServiceUpdateMyLocale,
} from '@attraccess/react-query-client';
import { normalizeDeviceLanguage } from '@attraccess/shared';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useAuth } from './useAuth';

export function useLocaleSync() {
  const { user, isAuthenticated } = useAuth();
  const language = useTranslationState((s) => s.language);
  const initializedUser = useRef<number | null | undefined>(undefined);
  const lastDefault = useRef<string | undefined>(undefined);
  const lastServerPreference = useRef<string | undefined>(undefined);
  const lastSynced = useRef<string | null>(null);
  const { data: systemLanguage } = useSettingsServiceGetSystemLanguage(undefined, { refetchInterval: 60000 });
  const { data: setup } = useSettingsServiceGetFirstTimeSetupStatus();
  const { mutate } = useUsersServiceUpdateMyLocale();
  const userId = isAuthenticated ? user?.id : null;
  const defaultLanguage = systemLanguage?.defaultLanguage;
  // Before the first setup choice, keep the browser suggestion. Once saved, all
  // unauthenticated pages and plugins share the configured system language.
  const hasSystemLanguage = setup && (!setup.available || systemLanguage?.configured);

  useEffect(() => {
    if (userId == null) {
      lastSynced.current = null;
      lastServerPreference.current = undefined;
      const identityChanged = initializedUser.current !== null;
      initializedUser.current = null;
      if (hasSystemLanguage && defaultLanguage && (identityChanged || lastDefault.current !== defaultLanguage)) {
        lastDefault.current = defaultLanguage;
        // Resolving a default is not a personal language selection.
        useTranslationState.setState({ language: defaultLanguage });
      }
      return;
    }
    const preference = user?.locale != null ? normalizeDeviceLanguage(user.locale) : defaultLanguage;
    if (!preference) return;
    if (initializedUser.current !== userId || lastServerPreference.current !== preference) {
      initializedUser.current = userId;
      lastServerPreference.current = preference;
      lastSynced.current = preference;
      // Server refreshes and default changes are not personal language selections.
      useTranslationState.setState({ language: preference });
      return;
    }
    if (language !== useTranslationState.getState().language || lastSynced.current === language) return;
    lastSynced.current = language;
    mutate({ requestBody: { locale: language } });
  }, [userId, user?.locale, language, defaultLanguage, hasSystemLanguage, mutate]);
}
