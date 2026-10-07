import { ResourceMeteringOperation } from '@attraccess/database-entities';
import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsFailsAnOperationWhoseBranchEndsWithoutReporting(scope: OperationsTestScope): void {
  it('fails an operation whose branch ends without reporting', async () => {
    const session = await scope.activeSession();
    scope.onCollect = async () => undefined;
    await expect(scope.run(session)).rejects.toThrow(/finished without reporting/);
    expect(await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' })).toEqual(
      expect.objectContaining({ status: 'failed' }),
    );
  });
}
