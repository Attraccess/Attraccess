import { NotificationCategory, NotificationCategoryPreferenceDto } from '@attraccess/react-query-client';

export function getCategoryPreference(
  preferences: NotificationCategoryPreferenceDto[] | undefined,
  category: NotificationCategory,
): NotificationCategoryPreferenceDto | undefined {
  return preferences?.find((preference) => preference.category === category);
}
