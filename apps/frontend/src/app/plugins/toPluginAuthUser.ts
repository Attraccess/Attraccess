import { AttraccessFrontendPluginAuthData } from '@attraccess/plugins-frontend-sdk';
import { CurrentUserDto } from '@attraccess/react-query-client';
import { formatUserDisplayName } from '@attraccess/shared';

/** The signed-in user as plugins see it, with the display name the plugin user model promises. */
export function toPluginAuthUser(user: CurrentUserDto | null): AttraccessFrontendPluginAuthData['user'] {
  if (!user) {
    return null as unknown as AttraccessFrontendPluginAuthData['user'];
  }
  return { ...user, displayName: formatUserDisplayName(user) } as unknown as AttraccessFrontendPluginAuthData['user'];
}
