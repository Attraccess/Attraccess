import { SelectQueryBuilder } from 'typeorm';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowTriggersInactivityFlowWhenResourceExceedsConfiguredInactivityMinutes(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('triggers inactivity flow when resource exceeds configured inactivity minutes', async () => {
    const resourceId = 9;
    const inactivityNode = scope.createNode({
      id: 'inactive-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY,
      resourceId,
      data: { minInactivityMinutes: 5 },
    });

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([inactivityNode]),
    } as unknown as SelectQueryBuilder<ResourceFlowNode>;
    const flowNodeRepoWithQueryBuilder = scope.flowNodeRepository as { createQueryBuilder: jest.Mock };
    flowNodeRepoWithQueryBuilder.createQueryBuilder = jest.fn(() => qb);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const resourceActivity = (scope.service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;
    resourceActivity.set(resourceId, tenMinutesAgo);

    const serviceWithStartFlow = scope.service as unknown as { startFlow: jest.Mock };
    const startFlowSpy = jest.spyOn(serviceWithStartFlow, 'startFlow').mockResolvedValue([]);

    await scope.service.checkResourceActivity();

    expect(startFlowSpy).toHaveBeenCalledWith(inactivityNode, { payload: {} });
    const updatedActivity = resourceActivity.get(resourceId) as Date;
    expect(updatedActivity).toBeInstanceOf(Date);
    expect(updatedActivity.getTime()).toBeGreaterThan(tenMinutesAgo.getTime());
  });
}
