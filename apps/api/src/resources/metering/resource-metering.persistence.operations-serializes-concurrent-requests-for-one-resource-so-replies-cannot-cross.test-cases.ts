import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsSerializesConcurrentRequestsForOneResourceSoRepliesCannotCross(
  scope: OperationsTestScope,
): void {
  it('serializes concurrent requests for one resource so replies cannot cross', async () => {
    const session = await scope.activeSession();
    let running = 0;
    let peak = 0;
    scope.onCollect = async ({ complete, kind }) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 30));
      await complete({ kind: 'reading', value: kind === 'final' ? '2' : '1' });
      running--;
    };
    const [interim, final] = await Promise.all([scope.run(session, 'interim'), scope.run(session, 'final')]);
    expect(peak).toBe(1);
    expect([interim.totalValue, final.totalValue]).toEqual(['1000000000', '2000000000']);
  });
}
