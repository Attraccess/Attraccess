import { ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsRejectsAReplyThatArrivesAfterTheOperationTimedOut(scope: OperationsTestScope): void {
  it('rejects a reply that arrives after the operation timed out', async () => {
    const session = await scope.activeSession();
    let lateReply: Promise<void> | undefined;
    scope.onCollect = ({ complete }) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          lateReply = complete({ kind: 'reading', value: '9' });
          lateReply.then(resolve, resolve);
        }, 1300);
      });
    await expect(scope.run(session, 'interim', 1)).rejects.toThrow(/did not reply within 1s/);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await expect(lateReply).rejects.toThrow(/already answered or has expired/);
    const operation = await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' });
    expect(operation).toEqual(expect.objectContaining({ status: 'expired', totalValue: null }));
    expect(
      (await scope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: session.id })).latestValue,
    ).toBeNull();
  }, 10_000);
}
