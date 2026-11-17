import { ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSessionResource, UsageSessionUser } from '@attraccess/application-models';
import { createInMemoryUsageScope } from './fake-store.test-fixture';
import { machineResource } from './in-memory-store.test-fixture';

export type InMemoryUsageScope = Awaited<ReturnType<typeof createInMemoryUsageScope>>;

/** A billing configuration that charges nothing, as a resource without billing has. */
export const freeBilling = {
  id: 1,
  resourceId: 1,
  creditsPerUsage: 0,
  creditsPerMinute: 0,
  creditsPerOperatingMinute: 0,
};

/**
 * Starts a spec on a machine and a user, with every gate open: no maintenance, a valid introduction, no
 * introducers or groups, and a billing configuration that charges nothing. Specs close the gate they test.
 */
export async function arrangeIntroducedUser(
  resource: Partial<UsageSessionResource> = {},
  user: UsageSessionUser = { id: 1, username: 'user' },
): Promise<{ scope: InMemoryUsageScope; user: UsageSessionUser; resource: UsageSessionResource }> {
  const scope = await createInMemoryUsageScope();
  const arranged = scope.store.addResource(machineResource(resource));
  scope.store.addUser(user);
  scope.maintenance.hasActiveMaintenance.mockResolvedValue(false);
  scope.introductions.hasValidIntroduction.mockResolvedValue(true);
  scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(false);
  scope.introducers.isIntroducer.mockResolvedValue(false);
  scope.introducers.canMaintain.mockResolvedValue(false);
  scope.groupIntroducers.isIntroducer.mockResolvedValue(false);
  scope.groups.getGroupsOfResource.mockResolvedValue([]);
  scope.billing.getResourceBillingConfiguration.mockResolvedValue(freeBilling);
  return { scope, user, resource: arranged };
}

/** A running session of `userId` (added as a user when unknown) that is visible: what a start leaves behind. */
export function runningSession(
  scope: InMemoryUsageScope,
  fields: { id: number; resourceId?: number; userId: number; supervisorUserId?: number },
) {
  if (!scope.store.users.has(fields.userId)) {
    scope.store.addUser({ id: fields.userId, username: `user-${fields.userId}` });
  }
  return scope.store.addSession({
    resourceId: 1,
    usageAction: ResourceUsageAction.Usage,
    startTime: new Date(),
    ...fields,
  });
}
