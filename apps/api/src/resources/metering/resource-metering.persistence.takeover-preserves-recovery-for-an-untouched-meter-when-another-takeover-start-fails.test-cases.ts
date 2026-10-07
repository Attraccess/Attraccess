import { BadRequestException } from '@nestjs/common';
import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
} from '@attraccess/database-entities';
import { TakeoverTestScope } from './resource-metering.persistence.spec';
export function registerTakeoverPreservesRecoveryForAnUntouchedMeterWhenAnotherTakeoverStartFails(
  scope: TakeoverTestScope,
): void {
  it('preserves recovery for an untouched meter when another takeover start fails', async () => {
    await scope.parentScope.seedMeter({}, { finalAttempts: 1 });
    const secondMeter = await scope.parentScope.source.getRepository(ResourceMeter).save({
      resourceId: 1,
      name: 'Water',
      creditsPerUnit: 10,
    });
    const nodes = scope.parentScope.source.getRepository(ResourceFlowNode);
    const edges = scope.parentScope.source.getRepository(ResourceFlowEdge);
    for (const node of await nodes.find()) {
      await nodes.save({ ...node, id: `${node.id}-water`, data: { ...node.data, meterId: secondMeter.id } });
    }
    for (const edge of await edges.find()) {
      await edges.save({
        ...edge,
        id: `${edge.id}-water`,
        source: `${edge.source}-water`,
        target: `${edge.target}-water`,
      });
    }
    const first = await scope.start(scope.parentScope.users[0]);
    scope.parentScope.onStart = async () => {
      throw new Error('first meter start failed');
    };
    await expect(scope.start(scope.parentScope.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const untouched = await scope.parentScope.source.getRepository(ResourceMeteringSession).findOneByOrFail({
      usageId: first.id,
      meterId: secondMeter.id,
    });
    expect(untouched.compromisedReason).toBeNull();
    scope.parentScope.onCollect = async () => {
      throw new Error('temporarily offline');
    };
    const ended = await scope.end(scope.parentScope.users[0]);
    expect(
      (await scope.parentScope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: untouched.id }))
        .status,
    ).toBe(ResourceMeteringSessionStatus.Pending);
    scope.parentScope.onCollect = scope.parentScope.reading('2', { observedAt: ended.endTime?.toISOString() });
    await scope.parentScope.metering.retrySettlement(1, untouched.id, scope.parentScope.users[0].id);
    expect((await scope.parentScope.correctionsOf(first.id)).corrections[0].amount).toBe(-20);
  });
}
