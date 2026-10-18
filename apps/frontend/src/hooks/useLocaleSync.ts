import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CurrentUserDto,
  User,
  UseUsersServiceGetCurrentKeyFn,
  useSettingsServiceGetFirstTimeSetupStatus,
  useSettingsServiceGetSystemLanguage,
  useUsersServiceUpdateMyLocale,
} from '@attraccess/react-query-client';
import { getSupportedDeviceLanguage } from '@attraccess/shared';
import { detectLanguage, detectPreferredLanguage, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { useAuth } from './useAuth';

type LocaleSaveContext = { userId: number | null | undefined; generation: number };

export function useLocaleSync() {
  const { user, isAuthenticated } = useAuth();
  const language = useTranslationState((s) => s.language);
  const explicitLanguage = useTranslationState((s) => s.explicitLanguage);
  const queryClient = useQueryClient();
  const initializedUser = useRef<number | null | undefined>(undefined);
  const lastDefault = useRef<string | undefined>(undefined);
  const lastServerPreference = useRef<string | undefined>(undefined);
  const lastSynced = useRef<string | null>(null);
  const { data: systemLanguage } = useSettingsServiceGetSystemLanguage(undefined, { refetchInterval: 60000 });
  const { data: setup } = useSettingsServiceGetFirstTimeSetupStatus();
  const userId = isAuthenticated ? user?.id : null;
  const latestSave = useRef(0);
  const { mutate } = useUsersServiceUpdateMyLocale<User, unknown, LocaleSaveContext>({
    onMutate() {
      return { userId, generation: ++latestSave.current };
    },
    onSuccess(savedUser, _variables, context) {
      if (
        !context ||
        context.generation !== latestSave.current ||
        context.userId !== initializedUser.current ||
        savedUser.id !== context.userId
      )
        return;
      queryClient.setQueryData<CurrentUserDto>(UseUsersServiceGetCurrentKeyFn(), (current) =>
        current?.id === savedUser.id ? { ...current, locale: savedUser.locale } : current,
      );
    },
  });
  const defaultLanguage = systemLanguage?.defaultLanguage;
  // Before setup, detection uses English as its final fallback. Once configured,
  // the system default applies only when no supported browser language is known.
  const hasSystemLanguage = setup && (!setup.available || systemLanguage?.configured);

  useEffect(() => {
    // Logout and account changes invalidate pending responses, including a later login as the same user.
    if (initializedUser.current !== userId) latestSave.current++;
    if (userId == null) {
      lastSynced.current = null;
      lastServerPreference.current = undefined;
      const identityChanged = initializedUser.current !== null;
      initializedUser.current = null;
      if (hasSystemLanguage && defaultLanguage && (identityChanged || lastDefault.current !== defaultLanguage)) {
        lastDefault.current = defaultLanguage;
        // Resolving a default is not a personal language selection.
        useTranslationState.setState({ language: detectLanguage(defaultLanguage) });
      }
      return;
    }
    const storedPreference = getSupportedDeviceLanguage(user?.locale);
    const detectedPreference = detectPreferredLanguage();
    const preference = storedPreference ?? detectedPreference ?? defaultLanguage;
    if (!preference) return;
    if (initializedUser.current !== userId || lastServerPreference.current !== preference) {
      initializedUser.current = userId;
      lastServerPreference.current = preference;
      lastSynced.current = storedPreference ?? detectedPreference ?? null;
      // Server refreshes and default changes are not personal language selections.
      useTranslationState.setState({ language: preference });
      // Record a known browser language for the next card tap and messages,
      // but never turn the system fallback into a personal preference.
      if (!storedPreference && detectedPreference) mutate({ requestBody: { locale: detectedPreference } });
      return;
    }
    if (
      !explicitLanguage ||
      language !== explicitLanguage ||
      language !== useTranslationState.getState().language ||
      lastSynced.current === explicitLanguage
    )
      return;
    lastSynced.current = explicitLanguage;
    mutate({ requestBody: { locale: explicitLanguage } });
  }, [userId, user?.locale, language, explicitLanguage, defaultLanguage, hasSystemLanguage, mutate]);
}
