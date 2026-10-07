import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsRejectsAReplyOfTheWrongKindAndAReportForAnUnknownResource(
  scope: OperationsTestScope,
): void {
  it('rejects a reply of the wrong kind and a report for an unknown resource', async () => {
    const session = await scope.activeSession();
    scope.onCollect = ({ complete }) => complete({ kind: 'ready' });
    await expect(scope.run(session)).rejects.toThrow(/does not answer/);

    const { MeteringReportExecutor } = await import('../flows/node-executors');
    await expect(
      new MeteringReportExecutor(scope.metering).execute(
        { resourceId: 99, data: { meterId: 1, value: '1' } } as never,
        {},
        {
          compileTemplate: (t: string) => t,
        } as never,
      ),
    ).rejects.toThrow(/METER_NOT_FOUND/);
  });
}
