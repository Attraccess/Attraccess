import { ResourceMeter, ResourceFlowNode } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsAnIdleCollectionReplyAfterAnIncrementSessionStarts(
  scope: GenericMetersTestScope,
): void {
  it('rejects an idle collection reply after an increment session starts', async () => {
    await scope.seedMeter();
    await scope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
    let reply!: () => Promise<void>;
    let signal!: () => void;
    const waiting = new Promise<void>((resolve) => {
      signal = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    scope.onCollect = async ({ complete }) => {
      reply = () => complete({ kind: 'reading', value: '105' });
      signal();
      await gate;
    };
    const collection = scope.metering.collectInterimReadings();
    await waiting;
    await scope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
    await scope.source.getRepository(ResourceFlowNode).save({
      id: 'increment-report',
      resourceId: 1,
      type: scope.T.OUTPUT_METERING_REPORT,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    try {
      await expect(reply()).rejects.toThrow('session boundary');
      expect((await scope.metering.listMeters(1))[0].counterValue).toBe('100');
      expect((await scope.sessionOf(started.id)).latestValue).toBe('0');
    } finally {
      release();
      await collection;
    }
  });
}
