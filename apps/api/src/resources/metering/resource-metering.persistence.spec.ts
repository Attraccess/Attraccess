import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';

import { BadRequestException } from '@nestjs/common';

import { rm } from 'node:fs/promises';

import { MeteringReadyExecutor, MeteringReport, MeteringReportExecutor } from '../flows/node-executors';

import { MeterFlowConversions1790300000000 } from './../../database/migrations/1790300000000-meter-flow-conversions';

import { closeResourceTransactionConnection } from './../../database/run-serialized-transaction';

import { inheritTestScope } from './../../test-utils/inherit-test-scope';

import { compileFlowTemplate } from './../flows/flow-template';

import { resetTestFixture } from './resource-metering.persistence.setup.test-fixture';

import { createFlowDefinedMeteringFixture } from './resource-metering.persistence.spec.createFlowDefinedMeteringFixture.test-fixture';

import { createGenericMetersFixture } from './resource-metering.persistence.spec.createGenericMetersFixture.test-fixture';

import { createUsageLifecycleFixture } from './resource-metering.persistence.spec.createUsageLifecycleFixture.test-fixture';

import type { Handler } from './resource-metering.persistence.spec.handler';

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

  describe('meter definition', () => {
    const meterDefinitionScope = inheritTestScope(
      {
        get metering() {
          return scope.metering;
        },
        set metering(value: typeof scope.metering) {
          scope.metering = value;
        },
        get seedMeter() {
          return scope.seedMeter;
        },
        get source() {
          return scope.source;
        },
        set source(value: typeof scope.source) {
          scope.source = value;
        },
      },
      scope,
    );

    it('is configured only when each trigger reaches its completion node', async () => {
      expect(await meterDefinitionScope.metering.getDefinition(1, 1)).toEqual(
        expect.objectContaining({ configured: false, problems: ['start-trigger-missing', 'collect-trigger-missing'] }),
      );
      await meterDefinitionScope.seedMeter();
      expect(await meterDefinitionScope.metering.getDefinition(1, 1)).toEqual(
        expect.objectContaining({ configured: true, problems: [] }),
      );
      await meterDefinitionScope.source.getRepository(ResourceFlowEdge).delete({ id: 'e1' });
      await meterDefinitionScope.source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
      expect((await meterDefinitionScope.metering.getDefinition(1, 1)).problems).toEqual([
        'ready-unreachable',
        'report-unreachable',
      ]);
    });

    it('applies the documented defaults to trigger settings', async () => {
      await meterDefinitionScope.seedMeter({}, {});
      const { start, collect } = await meterDefinitionScope.metering.getDefinition(1, 1);
      expect(start.timeoutSeconds).toBe(30);
      expect(collect).toEqual({
        meterId: 1,
        timeoutSeconds: 30,
        interimIntervalMinutes: 1,
        finalAttempts: 3,
        finalRetryDelaySeconds: 5,
      });
    });
  });

  describe('usage lifecycle', () => {
    const usageLifecycleScope = createUsageLifecycleFixture(scope);

    it('bills exactly 0.45 for 1.5 kWh at 0.30/kWh without touching the start/stop flows', async () => {
      await usageLifecycleScope.seedMeter();
      const session = await usageLifecycleScope.start();
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('1.5');
      const ended = await usageLifecycleScope.end();

      expect(session.meterRates).toEqual([{ meterId: 1, name: 'Energy (kWh)', creditsPerUnit: 30 }]);
      const { transaction, items: rows } = await usageLifecycleScope.items(ended.id);
      expect(transaction).toEqual(expect.objectContaining({ amount: -45, status: BillingTransactionStatus.Completed }));
      const energy = rows.find((item) => item.name === 'Energy (kWh)');
      expect(energy).toEqual(
        expect.objectContaining({
          unitPrice: 45,
          quantity: 1,
          meterQuantity: '1.5',
          meterCreditsPerUnit: 30,
          externalReference: expect.stringMatching(/^metering:.+:.+$/),
        }),
      );
      expect(await usageLifecycleScope.sessionOf(ended.id)).toEqual(
        expect.objectContaining({
          status: ResourceMeteringSessionStatus.Settled,
          chargeCredits: 45,
          consumedValue: '1500000000',
        }),
      );
    });

    it('initializes the meter before any start effect and collects only after the stop flow, before the charge', async () => {
      await usageLifecycleScope.seedMeter();
      await usageLifecycleScope.start();
      await usageLifecycleScope.end();
      expect(usageLifecycleScope.log).toEqual([
        'meter:start',
        `flow:${usageLifecycleScope.T.INPUT_RESOURCE_USAGE_STARTED}`,
        `flow:${usageLifecycleScope.T.INPUT_RESOURCE_USAGE_STOPPED}`,
        'meter:final',
        'charge',
      ]);
    });

    it('does not start an unmetered billed session when the meter is not configured', async () => {
      await usageLifecycleScope.source.getRepository(ResourceMeter).update(1, { name: 'Heartbeats' });
      await expect(usageLifecycleScope.start()).rejects.toThrow(
        expect.objectContaining({ message: 'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats' }),
      );
      expect(usageLifecycleScope.log).toEqual([]);
      expect(await usageLifecycleScope.source.getRepository(ResourceUsage).count()).toBe(0);
    });

    it.each([
      [
        'fails',
        async () => {
          throw new Error('modbus offline');
        },
      ],
      ['finishes without acknowledging', async () => undefined],
    ])('does not run start effects or leave a session when initialization %s', async (_name, handler) => {
      await usageLifecycleScope.seedMeter();
      usageLifecycleScope.onStart = handler as Handler;
      await expect(usageLifecycleScope.start()).rejects.toBeInstanceOf(BadRequestException);
      expect(usageLifecycleScope.log).toEqual(['meter:start']);
      expect(await usageLifecycleScope.source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await usageLifecycleScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('times out an initialization that never answers', async () => {
      await usageLifecycleScope.seedMeter({ timeoutSeconds: 1 });
      usageLifecycleScope.onStart = () => new Promise(() => undefined);
      await expect(usageLifecycleScope.start()).rejects.toThrow(
        expect.objectContaining({ message: expect.stringMatching(/^METER_INITIALIZATION_FAILED/) }),
      );
      expect(await usageLifecycleScope.source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await usageLifecycleScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    }, 10_000);

    it('removes the metering session of a start whose flow effects fail', async () => {
      await usageLifecycleScope.seedMeter();
      // Ordinary flow errors are logged and swallowed by the usage service; an external-effect failure aborts.
      const { ExternalEffectFailureError } = await import('../flows/errors/external-effect-failure.error');
      usageLifecycleScope.startEffects = async () => {
        throw new ExternalEffectFailureError('relay refused', new Error('cause'));
      };
      await expect(usageLifecycleScope.start()).rejects.toBeInstanceOf(ExternalEffectFailureError);
      expect(await usageLifecycleScope.source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await usageLifecycleScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('removes the session of an interrupted start during restart recovery', async () => {
      await usageLifecycleScope.seedMeter();
      const candidate = await usageLifecycleScope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        isFinalized: false,
        lifecyclePending: true,
      });
      await usageLifecycleScope.source.getRepository(ResourceUsageLifecycleAttempt).save({
        id: 'attempt',
        resourceId: 1,
        kind: 'start',
        candidateUsageId: candidate.id,
        previousUsageId: null,
        transitionTime: new Date(),
        formSubmissions: [],
        billingItems: [],
      });
      await usageLifecycleScope.source.getRepository(ResourceMeteringSession).save({
        id: 's1',
        resourceId: 1,
        usageId: candidate.id,
        status: ResourceMeteringSessionStatus.Active,
        creditsPerUnit: 30,
      });
      await usageLifecycleScope.usage.recoverInterruptedLifecycles();
      expect(await usageLifecycleScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('allows unconfigured tracking-only meters without blocking sessions', async () => {
      await usageLifecycleScope.source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 0 });
      await usageLifecycleScope.start();
      await usageLifecycleScope.end();
      expect(usageLifecycleScope.log).not.toContain('meter:start');
      expect(usageLifecycleScope.log).not.toContain('meter:final');
      expect(await usageLifecycleScope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('ends the usage and its stop effects even when the final reading is unavailable, leaving energy pending', async () => {
      await usageLifecycleScope.seedMeter({}, { finalAttempts: 2, finalRetryDelaySeconds: 0 });
      await usageLifecycleScope.start();
      usageLifecycleScope.onCollect = async () => {
        throw new Error('meter unreachable');
      };
      const ended = await usageLifecycleScope.end();

      expect(ended.endTime).not.toBeNull();
      expect(usageLifecycleScope.log.filter((entry) => entry === 'meter:final')).toHaveLength(2);
      const { transaction, items: rows } = await usageLifecycleScope.items(ended.id);
      expect(transaction.status).toBe(BillingTransactionStatus.Completed);
      expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
        expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
      ]);
      expect(await usageLifecycleScope.sessionOf(ended.id)).toEqual(
        expect.objectContaining({ status: ResourceMeteringSessionStatus.Pending, failureReason: 'meter unreachable' }),
      );
      expect((await usageLifecycleScope.metering.getStatus(1)).unsettled).toEqual([
        expect.objectContaining({ status: 'pending', retryable: true, reason: 'meter unreachable' }),
      ]);
    });

    it('settles a verified zero consumption as a zero charge instead of treating it as missing', async () => {
      await usageLifecycleScope.seedMeter();
      await usageLifecycleScope.start();
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('0');
      const ended = await usageLifecycleScope.end();
      const { items: rows } = await usageLifecycleScope.items(ended.id);
      expect(rows.find((item) => item.name === 'Energy (kWh)')).toEqual(
        expect.objectContaining({ unitPrice: 0, meterQuantity: '0' }),
      );
      expect((await usageLifecycleScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it.each([
      ['a non-numeric reading', usageLifecycleScope.reading('n/a')],
      ['an empty reading', usageLifecycleScope.reading('')],
      ['a negative reading', usageLifecycleScope.reading('-1')],
      [
        'a stale sample from before the stop',
        usageLifecycleScope.reading('1.5', { observedAt: '2020-01-01T00:00:00Z' }),
      ],
      ['a sample from the future', usageLifecycleScope.reading('1.5', { observedAt: '2999-01-01T00:00:00Z' })],
    ])('never turns %s into a zero charge', async (_name, handler) => {
      await usageLifecycleScope.seedMeter({}, { finalAttempts: 1 });
      await usageLifecycleScope.start();
      usageLifecycleScope.onCollect = handler;
      const ended = await usageLifecycleScope.end();
      const { transaction, items: rows } = await usageLifecycleScope.items(ended.id);
      expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
        expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
      ]);
      expect(transaction.amount).toBe(0);
      expect((await usageLifecycleScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    });

    it('rejects a counter that moved backwards within the session', async () => {
      await usageLifecycleScope.seedMeter({}, { finalAttempts: 1 });
      await usageLifecycleScope.start();
      const session = await usageLifecycleScope.source
        .getRepository(ResourceMeteringSession)
        .findOneByOrFail({ resourceId: 1 });
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('2.0');
      await usageLifecycleScope.metering['runOperation'](session, 'interim', {
        trigger: usageLifecycleScope.T.INPUT_METERING_COLLECT,
        timeoutSeconds: 5,
      });
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('1.0');
      const ended = await usageLifecycleScope.end();
      expect((await usageLifecycleScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await usageLifecycleScope.sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
    });

    it('counts a lifetime counter from its baseline and never mixes it with earlier consumption', async () => {
      await usageLifecycleScope.seedMeter();
      usageLifecycleScope.onStart = ({ complete }) =>
        complete({ kind: 'ready', baseline: { value: '1000' }, source: 'grid-meter' });
      await usageLifecycleScope.start();
      expect(
        (await usageLifecycleScope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 }))
          .baselineValue,
      ).toBe('1000000000000');
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('1001.5', { source: 'grid-meter' });
      const ended = await usageLifecycleScope.end();
      const { transaction } = await usageLifecycleScope.items(ended.id);
      expect(transaction.amount).toBe(-45);
      expect((await usageLifecycleScope.sessionOf(ended.id)).consumedValue).toBe('1500000000');
    });

    it('bills migrated flow conversions from the converted counter baseline through ordinary completion nodes', async () => {
      await usageLifecycleScope.seedMeter();
      const nodes = usageLifecycleScope.source.getRepository(ResourceFlowNode);
      await nodes.update('ready', { data: { meterId: 1, baselineValue: '{{reading}}', legacyEnergyUnit: 'Wh' } });
      await nodes.update('report', { data: { meterId: 1, value: '{{reading}}', legacyEnergyUnit: '{{unit}}' } });
      const runner = usageLifecycleScope.source.createQueryRunner();
      try {
        await new MeterFlowConversions1790300000000().up(runner);
      } finally {
        await runner.release();
      }
      const completion = (complete: (report: MeteringReport) => Promise<void>, kind: 'start' | 'final') => ({
        compileTemplate: compileFlowTemplate,
        metering: { meterId: 1, operationId: 'op', kind, complete },
      });
      usageLifecycleScope.onStart = async ({ complete }) => {
        await new MeteringReadyExecutor().execute(
          await nodes.findOneByOrFail({ id: 'ready' }),
          { reading: '1000000' },
          completion(complete, 'start') as never,
        );
      };
      usageLifecycleScope.onCollect = async ({ complete }) => {
        await new MeteringReportExecutor(usageLifecycleScope.metering).execute(
          await nodes.findOneByOrFail({ id: 'report' }),
          { reading: '1001500', unit: 'Wh' },
          completion(complete, 'final') as never,
        );
      };
      await usageLifecycleScope.start();
      const ended = await usageLifecycleScope.end();
      const { transaction, items: rows } = await usageLifecycleScope.items(ended.id);
      expect(transaction.amount).toBe(-45);
      expect(rows).toEqual([expect.objectContaining({ meterQuantity: '1.5', meterCreditsPerUnit: 30, unitPrice: 45 })]);
      expect((await nodes.findOneByOrFail({ id: 'report' })).data).not.toHaveProperty('legacyEnergyUnit');
    });

    it('rejects a lifetime counter that dropped below its baseline', async () => {
      await usageLifecycleScope.seedMeter({}, { finalAttempts: 1 });
      usageLifecycleScope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000' } });
      await usageLifecycleScope.start();
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('12');
      const ended = await usageLifecycleScope.end();
      expect((await usageLifecycleScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await usageLifecycleScope.sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
    });

    it('freezes the rate at session start so later rate changes do not alter the bill', async () => {
      await usageLifecycleScope.seedMeter();
      await usageLifecycleScope.start();
      await usageLifecycleScope.source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 90 });
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('1.5');
      const ended = await usageLifecycleScope.end();
      expect((await usageLifecycleScope.items(ended.id)).transaction.amount).toBe(-45);
    });

    it('charges the same total once however many interim readings and repeated stops happened', async () => {
      await usageLifecycleScope.seedMeter();
      const first = await usageLifecycleScope.start();
      const session = await usageLifecycleScope.source
        .getRepository(ResourceMeteringSession)
        .findOneByOrFail({ usageId: first.id });
      for (const total of ['0.5', '1.0', '1.0', '1.4']) {
        usageLifecycleScope.onCollect = usageLifecycleScope.reading(total);
        await usageLifecycleScope.metering['runOperation'](session, 'interim', {
          trigger: usageLifecycleScope.T.INPUT_METERING_COLLECT,
          timeoutSeconds: 5,
        });
      }
      usageLifecycleScope.onCollect = usageLifecycleScope.reading('1.5');
      const ended = await usageLifecycleScope.end();
      expect(
        (await usageLifecycleScope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)'),
      ).toHaveLength(1);
      // A second stop finds no active session and cannot add the energy again.
      await expect(usageLifecycleScope.end()).rejects.toBeInstanceOf(BadRequestException);
      expect((await usageLifecycleScope.items(ended.id)).transaction.amount).toBe(-45);
      // Settling again inside another transaction is a no-op.
      const finalOperation = await usageLifecycleScope.source
        .getRepository(ResourceMeteringOperation)
        .findOneByOrFail({ kind: 'final' });
      await usageLifecycleScope.source.transaction((manager) =>
        usageLifecycleScope.metering.settleInTransaction(manager, ended.id, {
          status: 'collected',
          meters: { [finalOperation.sessionId ?? 'missing']: { status: 'ready', operationId: finalOperation.id } },
        }),
      );
      expect(
        (await usageLifecycleScope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)'),
      ).toHaveLength(1);
    });

    describe('takeover', () => {
      const takeoverScope = inheritTestScope(
        {
          get parentScope() {
            return usageLifecycleScope;
          },
          get start() {
            return usageLifecycleScope.start;
          },
          get end() {
            return usageLifecycleScope.end;
          },
        },
        usageLifecycleScope,
      );

      it('preserves increment-only charges when a later meter fails takeover initialization', async () => {
        const requestedMeter = await takeoverScope.parentScope.source.getRepository(ResourceMeter).save({
          resourceId: 1,
          name: 'Water',
          creditsPerUnit: 10,
        });
        await takeoverScope.parentScope.seedMeter({}, { finalAttempts: 1 });
        const nodes = takeoverScope.parentScope.source.getRepository(ResourceFlowNode);
        for (const node of await nodes.find()) {
          await nodes.update(node.id, { data: { ...node.data, meterId: requestedMeter.id } });
        }
        await nodes.save({
          id: 'increment-report',
          resourceId: 1,
          type: takeoverScope.parentScope.T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode: 'increment', value: '1' },
        });
        const first = await takeoverScope.start(takeoverScope.parentScope.users[0]);
        await takeoverScope.parentScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
        const sessions = takeoverScope.parentScope.source.getRepository(ResourceMeteringSession);
        const untouched = await sessions.findOneByOrFail({ usageId: first.id, meterId: 1 });
        takeoverScope.parentScope.onStart = async () => {
          throw new Error('water meter start failed');
        };
        await expect(
          takeoverScope.start(takeoverScope.parentScope.users[1], { forceTakeOver: true }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect((await takeoverScope.parentScope.usage.getActiveSession(1))?.id).toBe(first.id);
        expect(await sessions.findOneByOrFail({ id: untouched.id })).toEqual(untouched);
        expect(await sessions.countBy({ status: ResourceMeteringSessionStatus.Active })).toBe(2);
        expect(await sessions.findOneByOrFail({ usageId: first.id, meterId: requestedMeter.id })).toEqual(
          expect.objectContaining({ compromisedReason: expect.stringMatching(/re-initialized by a takeover/) }),
        );

        await takeoverScope.end(takeoverScope.parentScope.users[0]);
        const bill = await takeoverScope.parentScope.items(first.id);
        expect(bill.transaction.amount).toBe(-60);
        expect(bill.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Energy (kWh)',
              meterQuantity: '2',
              meterCreditsPerUnit: 30,
              unitPrice: 60,
            }),
            expect.objectContaining({ name: 'Water', meterQuantity: null, meterCreditsPerUnit: 10, unitPrice: 0 }),
          ]),
        );
        expect((await sessions.findOneByOrFail({ id: untouched.id })).status).toBe(
          ResourceMeteringSessionStatus.Settled,
        );
      });

      it('preserves recovery for an untouched meter when another takeover start fails', async () => {
        await takeoverScope.parentScope.seedMeter({}, { finalAttempts: 1 });
        const secondMeter = await takeoverScope.parentScope.source.getRepository(ResourceMeter).save({
          resourceId: 1,
          name: 'Water',
          creditsPerUnit: 10,
        });
        const nodes = takeoverScope.parentScope.source.getRepository(ResourceFlowNode);
        const edges = takeoverScope.parentScope.source.getRepository(ResourceFlowEdge);
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
        const first = await takeoverScope.start(takeoverScope.parentScope.users[0]);
        takeoverScope.parentScope.onStart = async () => {
          throw new Error('first meter start failed');
        };
        await expect(
          takeoverScope.start(takeoverScope.parentScope.users[1], { forceTakeOver: true }),
        ).rejects.toBeInstanceOf(BadRequestException);
        const untouched = await takeoverScope.parentScope.source
          .getRepository(ResourceMeteringSession)
          .findOneByOrFail({
            usageId: first.id,
            meterId: secondMeter.id,
          });
        expect(untouched.compromisedReason).toBeNull();
        takeoverScope.parentScope.onCollect = async () => {
          throw new Error('temporarily offline');
        };
        const ended = await takeoverScope.end(takeoverScope.parentScope.users[0]);
        expect(
          (
            await takeoverScope.parentScope.source
              .getRepository(ResourceMeteringSession)
              .findOneByOrFail({ id: untouched.id })
          ).status,
        ).toBe(ResourceMeteringSessionStatus.Pending);
        takeoverScope.parentScope.onCollect = takeoverScope.parentScope.reading('2', {
          observedAt: ended.endTime?.toISOString(),
        });
        await takeoverScope.parentScope.metering.retrySettlement(
          1,
          untouched.id,
          takeoverScope.parentScope.users[0].id,
        );
        expect((await takeoverScope.parentScope.correctionsOf(first.id)).corrections[0].amount).toBe(-20);
      });

      it('reads the outgoing total before re-initializing the meter for the next session and bills both', async () => {
        await takeoverScope.parentScope.seedMeter();
        const first = await takeoverScope.start(takeoverScope.parentScope.users[0]);
        takeoverScope.parentScope.onCollect = takeoverScope.parentScope.reading('2.0');
        const second = await takeoverScope.start(takeoverScope.parentScope.users[1], { forceTakeOver: true });

        expect(takeoverScope.parentScope.log.slice(-4)).toEqual([
          'meter:final',
          'meter:start',
          `flow:${takeoverScope.parentScope.T.INPUT_RESOURCE_USAGE_TAKEOVER}`,
          'charge',
        ]);
        const outgoing = await takeoverScope.parentScope.items(first.id);
        expect(outgoing.transaction.amount).toBe(-60);
        expect((await takeoverScope.parentScope.sessionOf(first.id)).status).toBe(
          ResourceMeteringSessionStatus.Settled,
        );
        expect((await takeoverScope.parentScope.sessionOf(second.id)).status).toBe(
          ResourceMeteringSessionStatus.Active,
        );
        expect((await takeoverScope.parentScope.sessionOf(first.id)).compromisedReason).toBeNull();

        takeoverScope.parentScope.onCollect = takeoverScope.parentScope.reading('0.5');
        const ended = await takeoverScope.end(takeoverScope.parentScope.users[1]);
        expect((await takeoverScope.parentScope.items(ended.id)).transaction.amount).toBe(-15);
      });

      it('keeps the outgoing session but refuses to bill its unreliable total when the new meter start fails', async () => {
        await takeoverScope.parentScope.seedMeter({}, { finalAttempts: 1 });
        const first = await takeoverScope.start(takeoverScope.parentScope.users[0]);
        takeoverScope.parentScope.onStart = async () => {
          throw new Error('meter did not answer');
        };
        await expect(
          takeoverScope.start(takeoverScope.parentScope.users[1], { forceTakeOver: true }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect((await takeoverScope.parentScope.usage.getActiveSession(1))?.id).toBe(first.id);
        expect((await takeoverScope.parentScope.sessionOf(first.id)).compromisedReason).toMatch(
          /re-initialized by a takeover/,
        );

        takeoverScope.parentScope.onStart = takeoverScope.parentScope.ready;
        const ended = await takeoverScope.end(takeoverScope.parentScope.users[0]);
        expect(await takeoverScope.parentScope.sessionOf(ended.id)).toEqual(
          expect.objectContaining({
            status: ResourceMeteringSessionStatus.Failed,
            failureReason: expect.stringMatching(/re-initialized by a takeover/),
          }),
        );
        expect((await takeoverScope.parentScope.metering.getStatus(1)).unsettled).toEqual([
          expect.objectContaining({ retryable: false }),
        ]);
        expect(
          (await takeoverScope.parentScope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)'),
        ).toEqual([expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 })]);
      });

      it('marks the outgoing energy failed, not retryable, when its final reading is missing and the next session took the meter', async () => {
        await takeoverScope.parentScope.seedMeter({}, { finalAttempts: 1 });
        const first = await takeoverScope.start(takeoverScope.parentScope.users[0]);
        takeoverScope.parentScope.onCollect = async () => {
          throw new Error('meter unreachable');
        };
        await takeoverScope.start(takeoverScope.parentScope.users[1], { forceTakeOver: true });
        expect(await takeoverScope.parentScope.sessionOf(first.id)).toEqual(
          expect.objectContaining({ status: ResourceMeteringSessionStatus.Failed }),
        );
        await expect(
          takeoverScope.parentScope.metering.retrySettlement(
            1,
            (await takeoverScope.parentScope.sessionOf(first.id)).id,
            1,
          ),
        ).rejects.toThrow(expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }));
      });
    });

    describe('reconciliation', () => {
      async function endWithMissingFinal() {
        await usageLifecycleScope.seedMeter({}, { finalAttempts: 1 });
        await usageLifecycleScope.start();
        usageLifecycleScope.onCollect = async () => {
          throw new Error('meter unreachable');
        };
        const ended = await usageLifecycleScope.end();
        usageLifecycleScope.onCollect = usageLifecycleScope.reading('1.5', {
          observedAt: ended.endTime?.toISOString(),
        });
        return ended;
      }
      const reconciliationScope = inheritTestScope(
        {
          get parentScope() {
            return usageLifecycleScope;
          },
          get endWithMissingFinal() {
            return endWithMissingFinal;
          },
          get start() {
            return usageLifecycleScope.start;
          },
        },
        usageLifecycleScope,
      );

      it.each([
        ['advancing', '105', '12000000000'],
        ['reset', '4', '7000000000'],
      ])(
        'invalidates pending charges after an accepted %s free baseline even if another branch fails',
        async (_kind, baseline, lifetimeValue) => {
          await reconciliationScope.parentScope.source.getRepository(ResourceMeter).update(1, {
            counterValue: '100000000000',
            lifetimeValue: '7000000000',
          });
          reconciliationScope.parentScope.onStart = ({ complete }) =>
            complete({ kind: 'ready', baseline: { value: '100' } });
          const ended = await reconciliationScope.endWithMissingFinal();
          const session = await reconciliationScope.parentScope.sessionOf(ended.id);
          const before = await reconciliationScope.parentScope.items(ended.id);
          const priorMeter = await reconciliationScope.parentScope.source
            .getRepository(ResourceMeter)
            .findOneByOrFail({ id: 1 });
          const unrelatedMeter = await reconciliationScope.parentScope.source.getRepository(ResourceMeter).save({
            resourceId: 1,
            name: 'Water',
            creditsPerUnit: 0,
          });
          const unrelatedSession = await reconciliationScope.parentScope.source
            .getRepository(ResourceMeteringSession)
            .save({
              ...session,
              id: 'unrelated-pending',
              meterId: unrelatedMeter.id,
              meterName: unrelatedMeter.name,
            });
          await reconciliationScope.parentScope.metering.setRate(1, 1, 0);
          reconciliationScope.parentScope.onStart = async ({ complete }) => {
            await complete({ kind: 'ready', baseline: { value: baseline }, source: 'reinitialized-meter' });
            throw new Error('another start branch failed');
          };

          const started = await reconciliationScope.start(reconciliationScope.parentScope.users[1]);
          expect((await reconciliationScope.parentScope.usage.getActiveSession(1))?.id).toBe(started.id);
          expect(
            await reconciliationScope.parentScope.source
              .getRepository(ResourceMeteringSession)
              .countBy({ usageId: started.id }),
          ).toBe(0);
          const acceptedMeter = await reconciliationScope.parentScope.source
            .getRepository(ResourceMeter)
            .findOneByOrFail({ id: 1 });
          expect(acceptedMeter).toEqual(
            expect.objectContaining({
              counterValue: `${baseline}000000000`,
              lifetimeValue,
              latestObservedAt: expect.any(Date),
            }),
          );
          expect(acceptedMeter.latestObservedAt?.getTime()).toBeGreaterThanOrEqual(
            priorMeter.latestObservedAt?.getTime() ?? 0,
          );
          expect(await reconciliationScope.parentScope.sessionOf(ended.id)).toEqual(
            expect.objectContaining({
              status: ResourceMeteringSessionStatus.Failed,
              failureReason: 'The meter was re-initialized for a later session',
            }),
          );
          expect((await reconciliationScope.parentScope.metering.getStatus(1)).unsettled).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ sessionId: session.id, retryable: false, status: 'failed' }),
              expect.objectContaining({ sessionId: unrelatedSession.id, retryable: true, status: 'pending' }),
            ]),
          );
          expect(
            await reconciliationScope.parentScope.source
              .getRepository(ResourceMeteringSession)
              .findOneByOrFail({ id: unrelatedSession.id }),
          ).toEqual(unrelatedSession);

          // Even valid historical end-boundary evidence cannot charge an invalidated session.
          reconciliationScope.parentScope.onCollect = jest.fn(
            reconciliationScope.parentScope.reading('101.5', { observedAt: ended.endTime?.toISOString() }),
          );
          await expect(reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
            'METER_SESSION_NOT_PENDING',
          );
          expect(reconciliationScope.parentScope.onCollect).not.toHaveBeenCalled();
          expect((await reconciliationScope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
          expect(await reconciliationScope.parentScope.items(ended.id)).toEqual(before);
          expect(reconciliationScope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
          expect(reconciliationScope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
        },
      );

      it('keeps an older charge pending when a free start fails before acknowledging', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        const before = await reconciliationScope.parentScope.items(ended.id);
        await reconciliationScope.parentScope.metering.setRate(1, 1, 0);
        const priorMeter = await reconciliationScope.parentScope.source
          .getRepository(ResourceMeter)
          .findOneByOrFail({ id: 1 });
        reconciliationScope.parentScope.onStart = async () => {
          throw new Error('offline before acknowledgement');
        };

        const started = await reconciliationScope.start(reconciliationScope.parentScope.users[1]);
        expect((await reconciliationScope.parentScope.usage.getActiveSession(1))?.id).toBe(started.id);
        expect(
          await reconciliationScope.parentScope.source
            .getRepository(ResourceMeteringSession)
            .countBy({ usageId: started.id }),
        ).toBe(0);
        expect(
          await reconciliationScope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 }),
        ).toEqual(priorMeter);
        expect(await reconciliationScope.parentScope.sessionOf(ended.id)).toEqual(session);
        expect((await reconciliationScope.parentScope.metering.getStatus(1)).unsettled).toEqual([
          expect.objectContaining({ sessionId: session.id, retryable: true, status: 'pending' }),
        ]);
        expect(await reconciliationScope.parentScope.items(ended.id)).toEqual(before);
        expect((await reconciliationScope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
        expect(reconciliationScope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
        expect(reconciliationScope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      });

      it('invalidates an older pending charge when the next start uses only increments', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        await reconciliationScope.parentScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
        await reconciliationScope.parentScope.source.getRepository(ResourceFlowNode).save({
          id: 'increment-report',
          type: reconciliationScope.parentScope.T.OUTPUT_METERING_REPORT,
          resourceId: 1,
          data: { meterId: 1, mode: 'increment', value: '1' },
        });
        const startFlow = jest.fn(reconciliationScope.parentScope.ready);
        reconciliationScope.parentScope.onStart = startFlow;

        const started = await reconciliationScope.start(reconciliationScope.parentScope.users[1]);
        expect((await reconciliationScope.parentScope.sessionOf(started.id)).collectionMode).toBe('increment');
        expect(startFlow).not.toHaveBeenCalled();
        expect((await reconciliationScope.parentScope.sessionOf(ended.id)).status).toBe(
          ResourceMeteringSessionStatus.Failed,
        );
        expect((await reconciliationScope.parentScope.metering.getStatus(1)).unsettled).toEqual([
          expect.objectContaining({ sessionId: session.id, retryable: false }),
        ]);
      });

      it('retrying bills the pending energy as a separate correction exactly once and leaves the bill untouched', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        const before = await reconciliationScope.parentScope.items(ended.id);

        await reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1);
        expect(await reconciliationScope.parentScope.items(ended.id)).toEqual(before);
        const {
          original,
          corrections,
          items: correctionItems,
        } = await reconciliationScope.parentScope.correctionsOf(ended.id);
        expect(corrections).toEqual([
          expect.objectContaining({ amount: -45, status: 'completed', initiatorId: 1, resourceUsageId: null }),
        ]);
        expect(corrections[0].userId).toBe(original.userId);
        expect(reconciliationScope.parentScope.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledTimes(1);
        expect(reconciliationScope.parentScope.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: corrections[0].id,
            userId: original.userId,
            initiatorId: 1,
            amount: -45,
            source: 'meter-correction',
          }),
          expect.anything(),
        );
        expect(reconciliationScope.parentScope.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(
          corrections[0].id,
        );
        expect(correctionItems.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
        expect(await reconciliationScope.parentScope.sessionOf(ended.id)).toEqual(
          expect.objectContaining({ status: 'settled', chargeCredits: 45 }),
        );
        await expect(reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
          expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
        );
        expect((await reconciliationScope.parentScope.correctionsOf(ended.id)).corrections).toHaveLength(1);
      });

      it('applies the usage billing factor to a late energy charge like every other item', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        await reconciliationScope.parentScope.source
          .getRepository(ResourceUsage)
          .update(ended.id, { billingFactor: 50 });
        await reconciliationScope.parentScope.metering.retrySettlement(
          1,
          (await reconciliationScope.parentScope.sessionOf(ended.id)).id,
          1,
        );
        const { corrections, items: rows } = await reconciliationScope.parentScope.correctionsOf(ended.id);
        // 45 credits of energy, half price: round(45 - 22.5) = 23 discount, 22 charged.
        expect(corrections[0].amount).toBe(-22);
        expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-23);
      });

      it('rounds a large late correction exactly at the half-credit boundary', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        await reconciliationScope.parentScope.source
          .getRepository(ResourceUsage)
          .update(ended.id, { billingFactor: 50 });
        await reconciliationScope.parentScope.source
          .getRepository(ResourceMeteringSession)
          .update(session.id, { creditsPerUnit: 1 });
        reconciliationScope.parentScope.onCollect = ({ complete }) =>
          complete({
            kind: 'reading',
            value: '9007199254740991',
            observedAt: ended.endTime?.toISOString(),
          });
        await reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1);
        const { corrections, items: rows } = await reconciliationScope.parentScope.correctionsOf(ended.id);
        expect(corrections[0].amount).toBe(-4503599627370495);
        expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-4503599627370496);
      });

      it.each([undefined, 'after-end'])('rejects a retry first observing idle consumption (%s)', async (timestamp) => {
        const ended = await reconciliationScope.endWithMissingFinal();
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        reconciliationScope.parentScope.onCollect = reconciliationScope.parentScope.reading('5', {
          observedAt: timestamp ? new Date((ended.endTime as Date).getTime() + 1).toISOString() : undefined,
        });
        await expect(reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
          'session end boundary',
        );
        expect((await reconciliationScope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
        expect(
          (await reconciliationScope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 }))
            .counterValue,
        ).toBe('0');
        expect((await reconciliationScope.parentScope.sessionOf(ended.id)).status).toBe(
          ResourceMeteringSessionStatus.Pending,
        );
      });

      it('keeps the charge pending with the reason when the retry is stale or invalid', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        reconciliationScope.parentScope.onCollect = reconciliationScope.parentScope.reading('1.5', {
          observedAt: '2020-01-01T00:00:00Z',
        });
        await expect(
          reconciliationScope.parentScope.metering.retrySettlement(
            1,
            (await reconciliationScope.parentScope.sessionOf(ended.id)).id,
            1,
          ),
        ).rejects.toThrow(expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }));
        expect(await reconciliationScope.parentScope.sessionOf(ended.id)).toEqual(
          expect.objectContaining({ status: 'pending', failureReason: expect.stringMatching(/session end boundary/) }),
        );
        expect((await reconciliationScope.parentScope.items(ended.id)).transaction.amount).toBe(0);
        expect((await reconciliationScope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
        expect(reconciliationScope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
        expect(reconciliationScope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      });

      it('refuses to reconcile after a later session started on the meter, and can be waived', async () => {
        const ended = await reconciliationScope.endWithMissingFinal();
        await reconciliationScope.start(reconciliationScope.parentScope.users[1]);
        const session = await reconciliationScope.parentScope.sessionOf(ended.id);
        // Starting the next session already failed the older pending energy.
        expect(session.status).toBe(ResourceMeteringSessionStatus.Failed);
        await reconciliationScope.parentScope.source
          .getRepository(ResourceMeteringSession)
          .update(session.id, { status: ResourceMeteringSessionStatus.Pending });
        await expect(reconciliationScope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
        );
        expect((await reconciliationScope.parentScope.metering.waive(1, session.id, 7)).status).toBe(
          ResourceMeteringSessionStatus.Waived,
        );
        expect(reconciliationScope.parentScope.audit.recordResource).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'meter_charge.waived', actorId: 7, subjectId: 1 }),
        );
        await expect(reconciliationScope.parentScope.metering.waive(1, session.id, 7)).rejects.toThrow(
          expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
        );
      });
    });
  });
});

export type FlowDefinedMeteringTestScope = ReturnType<typeof createFlowDefinedMeteringFixture> & {
  seedMeter(startData?: object, collectData?: object): Promise<void>;
  items(usageId: number): Promise<{ transaction: BillingTransaction; items: BillingTransactionItem[] }>;
};
