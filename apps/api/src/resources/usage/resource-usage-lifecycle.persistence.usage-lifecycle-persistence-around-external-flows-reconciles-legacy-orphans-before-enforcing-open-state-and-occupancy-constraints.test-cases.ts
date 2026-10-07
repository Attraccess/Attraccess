import { ResourceUsage } from '@attraccess/database-entities';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsReconcilesLegacyOrphansBeforeEnforcingOpenStateAndOccupancyConstraints(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('reconciles legacy orphans before enforcing open-state and occupancy constraints', async () => {
    const orphan = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await scope.migrateIntegrity();
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
      usageInMinutes: 0,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
      }),
    ).rejects.toThrow('Open usage must be finalized or lifecycle-pending');
    await expect(scope.source.getRepository(ResourceUsage).update(orphan.id, { endTime: null })).rejects.toThrow(
      'Open usage must be finalized or lifecycle-pending',
    );
    const active = await scope.seedActiveSession();
    await expect(scope.seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      lifecyclePending: true,
      isFinalized: false,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).update(candidate.id, {
        isFinalized: true,
        lifecyclePending: false,
      }),
    ).rejects.toThrow('Resource already has an active usage session');
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 2,
        startTime: new Date(),
        lifecyclePending: true,
      }),
    ).rejects.toThrow('UNIQUE constraint');
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    expect((await scope.usage.getActiveSession(1))?.id).toBe(active.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(active.id);
    await scope.source.getRepository(ResourceUsage).delete(candidate.id);
    await scope.usage.recoverInterruptedLifecycles();
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toBeInstanceOf(ResourceInUseError);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
    expect(await scope.source.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(await scope.source.query('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });
}
