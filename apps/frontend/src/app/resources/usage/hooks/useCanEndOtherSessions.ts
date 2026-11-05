import { useCallback } from 'react';
import { ResourceUsage, useAccessControlServiceResourceIntroducersGetNames } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

/**
 * Who may end another person's session on a resource. Mirrors the server rule in endSession:
 * managers (`resources.update`), introducers and maintainers of the resource or one of its groups,
 * and the supervisor of a supervised session. The server makes the final call.
 */
export function useCanEndOtherSessions(resourceId: number) {
  const { hasPermission, user } = useAuth();
  // The names list holds direct and group introducers and maintainers, the same set the server checks.
  const { data: introducersAndMaintainers } = useAccessControlServiceResourceIntroducersGetNames({ resourceId });

  const canEndAnySession =
    hasPermission('resources.update') ||
    (!!user && !!introducersAndMaintainers?.some((entry) => entry.userId === user.id));

  const canEndSession = useCallback(
    (usage: Pick<ResourceUsage, 'supervisorUserId'> | null | undefined) =>
      canEndAnySession || (!!user && !!usage && usage.supervisorUserId === user.id),
    [canEndAnySession, user],
  );

  return { canEndAnySession, canEndSession };
}
