import { ResourceMeteringOperation } from '@attraccess/database-entities';
import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsMarksOperationsInterruptedByARestartAsExpired(scope: OperationsTestScope): void {
  it('marks operations interrupted by a restart as expired', async () => {
    const session = await scope.activeSession();
    await scope.source.getRepository(ResourceMeteringOperation).save({
      id: 'stuck',
      sessionId: session.id,
      resourceId: 1,
      kind: 'interim',
      status: 'pending',
      requestedAt: new Date(),
    });
    await scope.metering.onModuleInit();
    expect(await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ id: 'stuck' })).toEqual(
      expect.objectContaining({ status: 'expired' }),
    );
  });
}
