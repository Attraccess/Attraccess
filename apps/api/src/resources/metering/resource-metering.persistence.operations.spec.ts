import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
} from '@attraccess/database-entities';

import { rm } from 'node:fs/promises';

import { closeResourceTransactionConnection } from './../../database/run-serialized-transaction';

import { inheritTestScope } from './../../test-utils/inherit-test-scope';

import { resetTestFixture } from './resource-metering.persistence.setup.test-fixture';

import { createFlowDefinedMeteringFixture } from './resource-metering.persistence.spec.createFlowDefinedMeteringFixture.test-fixture';

import { createGenericMetersFixture } from './resource-metering.persistence.spec.createGenericMetersFixture.test-fixture';

import { createUsageLifecycleFixture } from './resource-metering.persistence.spec.createUsageLifecycleFixture.test-fixture';

import { T } from './resource-metering.persistence.spec.t';

// This SQLite suite runs multiple settlements per case; coverage on CI exceeds Jest's five-second default.
jest.setTimeout(30_000);

export { Handler } from './resource-metering.persistence.spec.handler';

export type GenericMetersTestScope = ReturnType<typeof createGenericMetersFixture>;

export type UsageLifecycleTestScope = ReturnType<typeof createUsageLifecycleFixture>;

describe('Flow-defined metering', () => {
  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = scope.source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
      {
        id: 'report',
        type: T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, value: '1' },
      },
    ]);
    await scope.source.getRepository(ResourceFlowEdge).save([
      { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
      { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
    ]);
  }

  async function items(usageId: number) {
    const transaction = await scope.source
      .getRepository(BillingTransaction)
      .findOneByOrFail({ resourceUsageId: usageId });
    return {
      transaction,
      items: await scope.source
        .getRepository(BillingTransactionItem)
        .find({ where: { billingTransactionId: transaction.id } }),
    };
  }

  const scope = Object.assign(createFlowDefinedMeteringFixture(), { seedMeter, items });

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('operations', () => {
    async function activeSession() {
      await scope.seedMeter();
      const started = await scope.usage.startSession(1, scope.users[0], {} as never);
      return scope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: started.id });
    }
    const run = (session: ResourceMeteringSession, kind: 'interim' | 'final' = 'interim', timeoutSeconds = 5) =>
      scope.metering['runOperation'](session, kind, {
        trigger: scope.T.INPUT_METERING_COLLECT,
        timeoutSeconds,
        ...(kind === 'final' ? { freshAfter: new Date(Date.now() - 1000) } : {}),
      });
    const operationsScope = inheritTestScope(
      {
        get activeSession() {
          return activeSession;
        },
        get onCollect() {
          return scope.onCollect;
        },
        set onCollect(value: typeof scope.onCollect) {
          scope.onCollect = value;
        },
        get run() {
          return run;
        },
        get source() {
          return scope.source;
        },
        set source(value: typeof scope.source) {
          scope.source = value;
        },
        get metering() {
          return scope.metering;
        },
        set metering(value: typeof scope.metering) {
          scope.metering = value;
        },
        get reading() {
          return scope.reading;
        },
        get usage() {
          return scope.usage;
        },
        set usage(value: typeof scope.usage) {
          scope.usage = value;
        },
        get users() {
          return scope.users;
        },
        set users(value: typeof scope.users) {
          scope.users = value;
        },
      },
      scope,
    );

    it('rejects a reply that arrives after the operation timed out', async () => {
      const session = await operationsScope.activeSession();
      let lateReply: Promise<void> | undefined;
      operationsScope.onCollect = ({ complete }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            lateReply = complete({ kind: 'reading', value: '9' });
            lateReply.then(resolve, resolve);
          }, 1300);
        });
      await expect(operationsScope.run(session, 'interim', 1)).rejects.toThrow(/did not reply within 1s/);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await expect(lateReply).rejects.toThrow(/already answered or has expired/);
      const operation = await operationsScope.source
        .getRepository(ResourceMeteringOperation)
        .findOneByOrFail({ kind: 'interim' });
      expect(operation).toEqual(expect.objectContaining({ status: 'expired', totalValue: null }));
      expect(
        (await operationsScope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: session.id }))
          .latestValue,
      ).toBeNull();
    }, 10_000);

    it('accepts an identical duplicate reply and rejects a conflicting one', async () => {
      const session = await operationsScope.activeSession();
      operationsScope.onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1' });
        await complete({ kind: 'reading', value: '1.000000000' });
      };
      expect((await operationsScope.run(session)).totalValue).toBe('1000000000');

      operationsScope.onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1.2' });
        await complete({ kind: 'reading', value: '1.3' });
      };
      await expect(operationsScope.run(session)).rejects.toThrow(/already answered/);
    });

    it('rejects a reply of the wrong kind and a report for an unknown resource', async () => {
      const session = await operationsScope.activeSession();
      operationsScope.onCollect = ({ complete }) => complete({ kind: 'ready' });
      await expect(operationsScope.run(session)).rejects.toThrow(/does not answer/);

      const { MeteringReportExecutor } = await import('../flows/node-executors');
      await expect(
        new MeteringReportExecutor(operationsScope.metering).execute(
          { resourceId: 99, data: { meterId: 1, value: '1' } } as never,
          {},
          {
            compileTemplate: (t: string) => t,
          } as never,
        ),
      ).rejects.toThrow(/METER_NOT_FOUND/);
    });

    it('fails an operation whose branch ends without reporting', async () => {
      const session = await operationsScope.activeSession();
      operationsScope.onCollect = async () => undefined;
      await expect(operationsScope.run(session)).rejects.toThrow(/finished without reporting/);
      expect(
        await operationsScope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' }),
      ).toEqual(expect.objectContaining({ status: 'failed' }));
    });

    it('serializes concurrent requests for one resource so replies cannot cross', async () => {
      const session = await operationsScope.activeSession();
      let running = 0;
      let peak = 0;
      operationsScope.onCollect = async ({ complete, kind }) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await complete({ kind: 'reading', value: kind === 'final' ? '2' : '1' });
        running--;
      };
      const [interim, final] = await Promise.all([
        operationsScope.run(session, 'interim'),
        operationsScope.run(session, 'final'),
      ]);
      expect(peak).toBe(1);
      expect([interim.totalValue, final.totalValue]).toEqual(['1000000000', '2000000000']);
    });

    it('marks operations interrupted by a restart as expired', async () => {
      const session = await operationsScope.activeSession();
      await operationsScope.source.getRepository(ResourceMeteringOperation).save({
        id: 'stuck',
        sessionId: session.id,
        resourceId: 1,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      await operationsScope.metering.onModuleInit();
      expect(
        await operationsScope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ id: 'stuck' }),
      ).toEqual(expect.objectContaining({ status: 'expired' }));
    });

    it("exposes the running session's live total and its exactly rounded energy cost", async () => {
      const session = await operationsScope.activeSession();
      expect((await operationsScope.metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ latestValue: null, chargeCredits: null, creditsPerUnit: 30 }),
      );
      operationsScope.onCollect = operationsScope.reading('0.05');
      await operationsScope.run(session);
      expect((await operationsScope.metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ sessionId: session.id, latestValue: '0.05', chargeCredits: 2, creditsPerUnit: 30 }),
      );
      await operationsScope.usage.endSession(1, operationsScope.users[0], {} as never);
      expect((await operationsScope.metering.getLive(1)).meters[0].session).toBeNull();
    });

    it('records interim readings for display only and skips busy or disabled meters', async () => {
      const session = await operationsScope.activeSession();
      await operationsScope.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      await operationsScope.source
        .getRepository(ResourceMeter)
        .update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      operationsScope.onCollect = operationsScope.reading('0.7');
      await operationsScope.metering.collectInterimReadings();
      expect((await operationsScope.metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ latestValue: '0.7' }),
      );

      await operationsScope.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      await operationsScope.source
        .getRepository(ResourceFlowNode)
        .update({ id: 'collect' }, { data: { meterId: 1, interimIntervalMinutes: 0 } });
      operationsScope.onCollect = operationsScope.reading('0.9');
      await operationsScope.metering.collectInterimReadings();
      expect((await operationsScope.metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ latestValue: '0.7' }),
      );
    });

    it('does not poll a meter that keeps failing more often than its interval', async () => {
      const session = await operationsScope.activeSession();
      await operationsScope.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      await operationsScope.source
        .getRepository(ResourceMeter)
        .update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      const collect = jest.fn().mockRejectedValue(new Error('meter unreachable'));
      operationsScope.onCollect = collect;
      await operationsScope.metering.collectInterimReadings();
      await operationsScope.metering.collectInterimReadings();
      expect(collect).toHaveBeenCalledTimes(1);
    });
  });
});
