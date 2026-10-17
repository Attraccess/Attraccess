import { resolveDateTimePreferences } from '@attraccess/shared';
import { useLayoutEffect } from 'react';
import { useDateTimePreferences } from '@attraccess/plugins-frontend-ui';
import { useAuth } from './useAuth';

export function useDateTimePreferencesSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const dateTimeLocale = resolveDateTimePreferences(user?.dateTimeLocale).dateTimeLocale;
  useLayoutEffect(() => {
    useDateTimePreferences.setState({ userId, dateTimeLocale });
  }, [userId, dateTimeLocale]);
}
