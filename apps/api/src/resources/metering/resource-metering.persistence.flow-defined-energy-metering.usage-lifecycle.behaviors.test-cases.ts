import { registerUsageLifecycleScopeFixture } from './resource-metering.persistence.usage-lifecycle-06b10e.test-fixture';
import { registerBillsExactly045For15KwhAt030KwhWithoutTouchingTheSCases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepPart15Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerCountsALifetimeCounterFromItsBaselineAndNeverMixesItWiPart12Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerDoesNotMeterResourcesWithoutAnEnergyRatePart7Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerDoesNotRunStartEffectsOrLeaveASessionWhenInitializationPart3Cases } from './resource-metering.persistence.usage-lifecycle.does-not-run-start-effects-or-leave-a-session-when-initialization.test-cases';
import { registerDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotPart2Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIPart8Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlPart14Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAPart1Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerNeverTurnsSIntoAZeroChargePart10Cases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerReconciliationPart17Cases } from './resource-metering.persistence.usage-lifecycle.reconciliation.test-cases';
import { registerRejectsACounterThatMovedBackwardsWithinTheSessionPart11Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerRejectsALifetimeCounterThatDroppedBelowItsBaselinePart13Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFailPart5Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerRemovesTheSessionOfAnInterruptedStartDuringRestartRecovePart6Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTPart9Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerTakeoverPart16Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerTimesOutAnInitializationThatNeverAnswersPart4Cases } from './resource-metering.persistence.usage-lifecycle.rejects-a-counter-that-moved-backwards-within-the-session.behaviors.test-cases';
import { registerFlowDefinedEnergyMeteringFixture } from './resource-metering.persistence.flow-defined-energy-metering.test-fixture';
import {
  BillingTransactionStatus,
  ResourceMeteringSessionStatus,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceUsage,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';

export function registerUsageLifecycleCases(fixture: ReturnType<typeof registerFlowDefinedEnergyMeteringFixture>) {
  describe('usage lifecycle', () => {
    const scope = registerUsageLifecycleScopeFixture(fixture);
    registerBillsExactly045For15KwhAt030KwhWithoutTouchingTheSCases(scope);
    registerInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAPart1Cases(scope);
    registerDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotPart2Cases(scope);
    registerDoesNotRunStartEffectsOrLeaveASessionWhenInitializationPart3Cases(scope);
    registerTimesOutAnInitializationThatNeverAnswersPart4Cases(scope);
    registerRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFailPart5Cases(scope);
    registerRemovesTheSessionOfAnInterruptedStartDuringRestartRecovePart6Cases(scope);
    registerDoesNotMeterResourcesWithoutAnEnergyRatePart7Cases(scope);
    registerEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIPart8Cases(scope);
    registerSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTPart9Cases(scope);
    registerNeverTurnsSIntoAZeroChargePart10Cases(scope);
    registerRejectsACounterThatMovedBackwardsWithinTheSessionPart11Cases(scope);
    registerCountsALifetimeCounterFromItsBaselineAndNeverMixesItWiPart12Cases(scope);
    registerRejectsALifetimeCounterThatDroppedBelowItsBaselinePart13Cases(scope);
    registerFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlPart14Cases(scope);
    registerChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepPart15Cases(scope);
    registerTakeoverPart16Cases(scope);
    registerReconciliationPart17Cases(scope);
  });
}

export function registerBillsExactly045For15KwhAt030KwhWithoutTouchingTheSCases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('bills exactly 0.45 for 1.5 kWh at 0.30/kWh without touching the start/stop flows', async () => {
    await fixture.fixture.seedMeter();
    const session = await fixture.start();
    fixture.fixture.onCollect = fixture.fixture.reading('1.5');
    const ended = await fixture.end();

    expect(session.energyCreditsPerKwh).toBe(30);
    const { transaction, items: rows } = await fixture.fixture.items(ended.id);
    expect(transaction).toEqual(expect.objectContaining({ amount: -45, status: BillingTransactionStatus.Completed }));
    const energy = rows.find((item) => item.name === 'ENERGY');
    expect(energy).toEqual(
      expect.objectContaining({
        unitPrice: 45,
        quantity: 1,
        energyMicroWh: '1500000000',
        energyCreditsPerKwh: 30,
        externalReference: expect.stringMatching(/^metering:.+:.+$/),
      }),
    );
    expect(await fixture.fixture.sessionOf(ended.id)).toEqual(
      expect.objectContaining({
        status: ResourceMeteringSessionStatus.Settled,
        chargeCredits: 45,
        consumedMicroWh: '1500000000',
      }),
    );
  });
}

export function registerChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepPart15Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('charges the same total once however many interim readings and repeated stops happened', async () => {
    await fixture.fixture.seedMeter();
    const first = await fixture.start();
    const session = await fixture.fixture.source
      .getRepository(ResourceMeteringSession)
      .findOneByOrFail({ usageId: first.id });
    for (const total of ['0.5', '1.0', '1.0', '1.4']) {
      fixture.fixture.onCollect = fixture.fixture.reading(total);
      await fixture.fixture.metering['runOperation'](session, 'interim', {
        trigger: fixture.fixture.T.INPUT_METERING_COLLECT,
        timeoutSeconds: 5,
      });
    }
    fixture.fixture.onCollect = fixture.fixture.reading('1.5');
    const ended = await fixture.end();
    expect((await fixture.fixture.items(ended.id)).items.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
    // A second stop finds no active session and cannot add the energy again.
    await expect(fixture.end()).rejects.toBeInstanceOf(BadRequestException);
    expect((await fixture.fixture.items(ended.id)).transaction.amount).toBe(-45);
    // Settling again inside another transaction is a no-op.
    const finalOperation = await fixture.fixture.source
      .getRepository(ResourceMeteringOperation)
      .findOneByOrFail({ kind: 'final' });
    await fixture.fixture.source.transaction((manager) =>
      fixture.fixture.metering.settleInTransaction(manager, ended.id, {
        status: 'ready',
        operationId: finalOperation.id,
      }),
    );
    expect((await fixture.fixture.items(ended.id)).items.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
  });
}

export function registerCountsALifetimeCounterFromItsBaselineAndNeverMixesItWiPart12Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('counts a lifetime counter from its baseline and never mixes it with earlier consumption', async () => {
    await fixture.fixture.seedMeter();
    fixture.fixture.onStart = ({ complete }) =>
      complete({ kind: 'ready', baseline: { value: '1000', unit: 'kWh' }, source: 'grid-meter' });
    await fixture.start();
    expect(
      (await fixture.fixture.source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 }))
        .baselineMicroWh,
    ).toBe('1000000000000');
    fixture.fixture.onCollect = fixture.fixture.reading('1001.5', 'kWh', { source: 'grid-meter' });
    const ended = await fixture.end();
    const { transaction } = await fixture.fixture.items(ended.id);
    expect(transaction.amount).toBe(-45);
    expect((await fixture.fixture.sessionOf(ended.id)).consumedMicroWh).toBe('1500000000');
  });
}

export function registerDoesNotMeterResourcesWithoutAnEnergyRatePart7Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('does not meter resources without an energy rate', async () => {
    fixture.fixture.configRate = 0;
    await fixture.start();
    await fixture.end();
    expect(fixture.fixture.log).not.toContain('meter:start');
    expect(fixture.fixture.log).not.toContain('meter:final');
    expect(await fixture.fixture.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}

export function registerDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotPart2Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('does not start an unmetered billed session when the meter is not configured', async () => {
    await expect(fixture.start()).rejects.toThrow(expect.objectContaining({ message: 'METER_NOT_CONFIGURED' }));
    expect(fixture.fixture.log).toEqual([]);
    expect(await fixture.fixture.source.getRepository(ResourceUsage).count()).toBe(0);
  });
}

export function registerEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIPart8Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('ends the usage and its stop effects even when the final reading is unavailable, leaving energy pending', async () => {
    await fixture.fixture.seedMeter({}, { finalAttempts: 2, finalRetryDelaySeconds: 0 });
    await fixture.start();
    fixture.fixture.onCollect = async () => {
      throw new Error('meter unreachable');
    };
    const ended = await fixture.end();

    expect(ended.endTime).not.toBeNull();
    expect(fixture.fixture.log.filter((entry) => entry === 'meter:final')).toHaveLength(2);
    const { transaction, items: rows } = await fixture.fixture.items(ended.id);
    expect(transaction.status).toBe(BillingTransactionStatus.Completed);
    expect(rows.some((item) => item.name === 'ENERGY')).toBe(false);
    expect(await fixture.fixture.sessionOf(ended.id)).toEqual(
      expect.objectContaining({ status: ResourceMeteringSessionStatus.Pending, failureReason: 'meter unreachable' }),
    );
    expect((await fixture.fixture.metering.getStatus(1)).unsettled).toEqual([
      expect.objectContaining({ status: 'pending', retryable: true, reason: 'meter unreachable' }),
    ]);
  });
}

export function registerFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlPart14Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('freezes the rate at session start so later rate changes do not alter the bill', async () => {
    await fixture.fixture.seedMeter();
    await fixture.start();
    fixture.fixture.configRate = 90;
    fixture.fixture.onCollect = fixture.fixture.reading('1.5');
    const ended = await fixture.end();
    expect((await fixture.fixture.items(ended.id)).transaction.amount).toBe(-45);
  });
}

export function registerInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAPart1Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('initializes the meter before any start effect and collects only after the stop flow, before the charge', async () => {
    await fixture.fixture.seedMeter();
    await fixture.start();
    await fixture.end();
    expect(fixture.fixture.log).toEqual([
      'meter:start',
      `flow:${fixture.fixture.T.INPUT_RESOURCE_USAGE_STARTED}`,
      `flow:${fixture.fixture.T.INPUT_RESOURCE_USAGE_STOPPED}`,
      'meter:final',
      'charge',
    ]);
  });
}

export function registerNeverTurnsSIntoAZeroChargePart10Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it.each([
    ['a non-numeric reading', fixture.fixture.reading('n/a')],
    ['an empty reading', fixture.fixture.reading('')],
    ['a power sample', fixture.fixture.reading('2.4', 'kW')],
    ['an unknown unit', fixture.fixture.reading('2', 'bananas')],
    ['a negative reading', fixture.fixture.reading('-1')],
    [
      'a stale sample from before the stop',
      fixture.fixture.reading('1.5', 'kWh', { observedAt: '2020-01-01T00:00:00Z' }),
    ],
    ['a sample from the future', fixture.fixture.reading('1.5', 'kWh', { observedAt: '2999-01-01T00:00:00Z' })],
  ])('never turns %s into a zero charge', async (_name, handler) => {
    await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
    await fixture.start();
    fixture.fixture.onCollect = handler;
    const ended = await fixture.end();
    const { transaction, items: rows } = await fixture.fixture.items(ended.id);
    expect(rows.some((item) => item.name === 'ENERGY')).toBe(false);
    expect(transaction.amount).toBe(0);
    expect((await fixture.fixture.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
  });
}
