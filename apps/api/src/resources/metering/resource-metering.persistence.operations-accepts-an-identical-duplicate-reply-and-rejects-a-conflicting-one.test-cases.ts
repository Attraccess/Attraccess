import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsAcceptsAnIdenticalDuplicateReplyAndRejectsAConflictingOne(
  scope: OperationsTestScope,
): void {
  it('accepts an identical duplicate reply and rejects a conflicting one', async () => {
    const session = await scope.activeSession();
    scope.onCollect = async ({ complete }) => {
      await complete({ kind: 'reading', value: '1' });
      await complete({ kind: 'reading', value: '1.000000000' });
    };
    expect((await scope.run(session)).totalValue).toBe('1000000000');

    scope.onCollect = async ({ complete }) => {
      await complete({ kind: 'reading', value: '1.2' });
      await complete({ kind: 'reading', value: '1.3' });
    };
    await expect(scope.run(session)).rejects.toThrow(/already answered/);
  });
}
