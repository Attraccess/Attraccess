import {
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { registerUsageLifecycleScopeFixture } from './resource-metering.persistence.usage-lifecycle-06b10e.test-fixture';
import { BadRequestException } from '@nestjs/common';

export function registerRejectsACounterThatMovedBackwardsWithinTheSessionPart11Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('rejects a counter that moved backwards within the session', async () => {
    await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
    await fixture.start();
    const session = await fixture.fixture.source
      .getRepository(ResourceMeteringSession)
      .findOneByOrFail({ resourceId: 1 });
    fixture.fixture.onCollect = fixture.fixture.reading('2.0');
    await fixture.fixture.metering['runOperation'](session, 'interim', {
      trigger: fixture.fixture.T.INPUT_METERING_COLLECT,
      timeoutSeconds: 5,
    });
    fixture.fixture.onCollect = fixture.fixture.reading('1.0');
    const ended = await fixture.end();
    expect((await fixture.fixture.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    expect((await fixture.fixture.sessionOf(ended.id)).failureReason).toMatch(/lower than an earlier reading/);
  });
}

export function registerRejectsALifetimeCounterThatDroppedBelowItsBaselinePart13Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('rejects a lifetime counter that dropped below its baseline', async () => {
    await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
    fixture.fixture.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000', unit: 'kWh' } });
    await fixture.start();
    fixture.fixture.onCollect = fixture.fixture.reading('12', 'kWh');
    const ended = await fixture.end();
    expect((await fixture.fixture.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    expect((await fixture.fixture.sessionOf(ended.id)).failureReason).toMatch(/below the baseline/);
  });
}

export function registerRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFailPart5Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('removes the metering session of a start whose flow effects fail', async () => {
    await fixture.fixture.seedMeter();
    // Ordinary flow errors are logged and swallowed by the usage service; an external-effect failure aborts.
    const { ExternalEffectFailureError } = await import('../flows/errors/external-effect-failure.error');
    fixture.fixture.startEffects = async () => {
      throw new ExternalEffectFailureError('relay refused', new Error('cause'));
    };
    await expect(fixture.start()).rejects.toBeInstanceOf(ExternalEffectFailureError);
    expect(await fixture.fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.fixture.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}

export function registerRemovesTheSessionOfAnInterruptedStartDuringRestartRecovePart6Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('removes the session of an interrupted start during restart recovery', async () => {
    await fixture.fixture.seedMeter();
    const candidate = await fixture.fixture.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: true,
    });
    await fixture.fixture.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'attempt',
      resourceId: 1,
      kind: 'start',
      candidateUsageId: candidate.id,
      previousUsageId: null,
      transitionTime: new Date(),
      formSubmissions: [],
      billingItems: [],
    });
    await fixture.fixture.source.getRepository(ResourceMeteringSession).save({
      id: 's1',
      resourceId: 1,
      usageId: candidate.id,
      status: ResourceMeteringSessionStatus.Active,
      creditsPerKwh: 30,
    });
    await fixture.fixture.usage.recoverInterruptedLifecycles();
    expect(await fixture.fixture.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}

export function registerSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTPart9Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('settles a verified zero consumption as a zero charge instead of treating it as missing', async () => {
    await fixture.fixture.seedMeter();
    await fixture.start();
    fixture.fixture.onCollect = fixture.fixture.reading('0');
    const ended = await fixture.end();
    const { items: rows } = await fixture.fixture.items(ended.id);
    expect(rows.find((item) => item.name === 'ENERGY')).toEqual(
      expect.objectContaining({ unitPrice: 0, energyMicroWh: '0' }),
    );
    expect((await fixture.fixture.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
  });
}

export function registerTakeoverPart16Cases(fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>) {
  describe('takeover', () => {
    it('reads the outgoing total before re-initializing the meter for the next session and bills both', async () => {
      await fixture.fixture.seedMeter();
      const first = await fixture.start(fixture.fixture.users[0]);
      fixture.fixture.onCollect = fixture.fixture.reading('2.0');
      const second = await fixture.start(fixture.fixture.users[1], { forceTakeOver: true });

      expect(fixture.fixture.log.slice(-4)).toEqual([
        'meter:final',
        'meter:start',
        `flow:${fixture.fixture.T.INPUT_RESOURCE_USAGE_TAKEOVER}`,
        'charge',
      ]);
      const outgoing = await fixture.fixture.items(first.id);
      expect(outgoing.transaction.amount).toBe(-60);
      expect((await fixture.fixture.sessionOf(first.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
      expect((await fixture.fixture.sessionOf(second.id)).status).toBe(ResourceMeteringSessionStatus.Active);
      expect((await fixture.fixture.sessionOf(first.id)).compromisedReason).toBeNull();

      fixture.fixture.onCollect = fixture.fixture.reading('0.5');
      const ended = await fixture.end(fixture.fixture.users[1]);
      expect((await fixture.fixture.items(ended.id)).transaction.amount).toBe(-15);
    });

    it('keeps the outgoing session but refuses to bill its unreliable total when the new meter start fails', async () => {
      await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
      const first = await fixture.start(fixture.fixture.users[0]);
      fixture.fixture.onStart = async () => {
        throw new Error('meter did not answer');
      };
      await expect(fixture.start(fixture.fixture.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect((await fixture.fixture.usage.getActiveSession(1, true))?.id).toBe(first.id);
      expect((await fixture.fixture.sessionOf(first.id)).compromisedReason).toMatch(/re-initialized by a takeover/);

      fixture.fixture.onStart = fixture.fixture.ready;
      const ended = await fixture.end(fixture.fixture.users[0]);
      expect(await fixture.fixture.sessionOf(ended.id)).toEqual(
        expect.objectContaining({
          status: ResourceMeteringSessionStatus.Failed,
          failureReason: expect.stringMatching(/re-initialized by a takeover/),
        }),
      );
      expect((await fixture.fixture.metering.getStatus(1)).unsettled).toEqual([
        expect.objectContaining({ retryable: false }),
      ]);
      expect((await fixture.fixture.items(ended.id)).items.some((item) => item.name === 'ENERGY')).toBe(false);
    });

    it('marks the outgoing energy failed, not retryable, when its final reading is missing and the next session took the meter', async () => {
      await fixture.fixture.seedMeter({}, { finalAttempts: 1 });
      const first = await fixture.start(fixture.fixture.users[0]);
      fixture.fixture.onCollect = async () => {
        throw new Error('meter unreachable');
      };
      await fixture.start(fixture.fixture.users[1], { forceTakeOver: true });
      expect(await fixture.fixture.sessionOf(first.id)).toEqual(
        expect.objectContaining({ status: ResourceMeteringSessionStatus.Failed }),
      );
      await expect(
        fixture.fixture.metering.retrySettlement(1, (await fixture.fixture.sessionOf(first.id)).id, 1),
      ).rejects.toThrow(expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }));
    });
  });
}

export function registerTimesOutAnInitializationThatNeverAnswersPart4Cases(
  fixture: ReturnType<typeof registerUsageLifecycleScopeFixture>,
) {
  it('times out an initialization that never answers', async () => {
    await fixture.fixture.seedMeter({ timeoutSeconds: 1 });
    fixture.fixture.onStart = () => new Promise(() => undefined);
    await expect(fixture.start()).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(/^METER_INITIALIZATION_FAILED/) }),
    );
    expect(await fixture.fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.fixture.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  }, 10_000);
}
