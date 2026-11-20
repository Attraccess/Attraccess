import { registerResourceRetrainingServiceEvaluateFixture } from './resourceRetraining.service.resource-retraining-service-evaluate.test-fixture';
import { registerResourceRetrainingServiceStatusAggregationFixture } from './resourceRetraining.service.resource-retraining-service-status-aggregation.test-fixture';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { IntroductionHistoryAction } from '@attraccess/application-models';

describe('ResourceRetrainingService.evaluate', () => {
  const fixture = registerResourceRetrainingServiceEvaluateFixture();

  it('does not apply when no thresholds are configured', () => {
    const result = fixture.service.evaluate(
      fixture.policy(),
      fixture.trainedAt,
      null,
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(result.applies).toBe(false);
    expect(result.isDue).toBe(false);
  });

  it('becomes due once the max training age has passed', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 365 });
    const before = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 364 * fixture.DAY),
    );
    const after = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 366 * fixture.DAY),
    );

    expect(before.applies).toBe(true);
    expect(before.isDue).toBe(false);
    expect(after.isDue).toBe(true);
    expect(after.reason).toBe('age');
  });

  it('uses last usage as the inactivity baseline', () => {
    const p = fixture.policy({ retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date('2026-06-01T00:00:00.000Z');

    const fresh = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(lastUsedAt.getTime() + 29 * fixture.DAY),
    );
    const stale = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(lastUsedAt.getTime() + 31 * fixture.DAY),
    );

    expect(fresh.isDue).toBe(false);
    expect(stale.isDue).toBe(true);
    expect(stale.reason).toBe('inactivity');
  });

  it('falls back to trainedAt for inactivity when there is no usage', () => {
    const p = fixture.policy({ retrainingMaxInactivityDays: 30 });
    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 31 * fixture.DAY),
    );
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
  });

  it('reports the soonest trigger when both are configured', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 365, retrainingMaxInactivityDays: 30 });
    const lastUsedAt = new Date(fixture.trainedAt.getTime() + 10 * fixture.DAY);

    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      lastUsedAt,
      new Date(fixture.trainedAt.getTime() + 45 * fixture.DAY),
    );
    expect(result.isDue).toBe(true);
    expect(result.reason).toBe('inactivity');
    expect(result.dueAt?.getTime()).toBe(lastUsedAt.getTime() + 30 * fixture.DAY);
  });

  it('passes through the blocksAccess flag', () => {
    const p = fixture.policy({ retrainingMaxAgeDays: 1, retrainingBlocksAccess: true });
    const result = fixture.service.evaluate(
      p,
      fixture.trainedAt,
      null,
      new Date(fixture.trainedAt.getTime() + 2 * fixture.DAY),
    );
    expect(result.blocksAccess).toBe(true);
  });

  const lathe = {
    id: 1,
    name: 'Lathe',
    retrainingMaxAgeDays: 1,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: true,
  };
  const woodShop = { ...lathe, id: 4, name: 'Wood shop' };

  /** The service over fakes of its two ports; the latest history item is a GRANT unless told otherwise. */
  function build(options: {
    resource?: typeof lathe | null;
    group?: typeof woodShop | null;
    lastHistory?: { action: IntroductionHistoryAction; createdAt?: Date } | null;
    email?: { sendUserRetrainingEmail: jest.Mock };
    audit: { record: jest.Mock };
  }) {
    const introductionStore = {
      lastHistoryItem: jest
        .fn()
        .mockResolvedValue(
          options.lastHistory === undefined
            ? { createdAt: fixture.trainedAt, action: IntroductionHistoryAction.GRANT }
            : options.lastHistory,
        ),
      latestGrant: jest
        .fn()
        .mockResolvedValue({ createdAt: fixture.trainedAt, action: IntroductionHistoryAction.GRANT }),
      markRetrainingRequiredAudited: jest.fn().mockResolvedValue(undefined),
      markRetrainingNotified: jest.fn().mockResolvedValue(undefined),
    };
    const retrainingStore = {
      findResourceTarget: jest.fn().mockResolvedValue(options.resource ?? null),
      findGroupTarget: jest.fn().mockResolvedValue(options.group ?? null),
      lastResourceUseAt: jest.fn().mockResolvedValue(null),
      lastGroupUseAt: jest.fn().mockResolvedValue(null),
    };
    const service = new ResourceRetrainingService(
      retrainingStore as never,
      introductionStore as never,
      null as never,
      (options.email ?? { sendUserRetrainingEmail: jest.fn() }) as never,
      options.audit as never,
    );
    const notify = (introduction: object, now: Date) =>
      (service as never as { notifyIfDue: (introduction: object, now: Date) => Promise<void> }).notifyIfDue(
        introduction,
        now,
      );
    return { service, notify, introductionStore };
  }

  it('records a system-origin required transition when the scheduled evaluation first notifies', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const { notify, introductionStore } = build({ resource: lathe, audit });

    await notify(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingNotifiedAt: null, retrainingRequiredAuditedAt: null },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.record).toHaveBeenCalledWith({
      domain: 'resource',
      action: 'retraining.required',
      actor: { id: null, authenticationMethod: null },
      subject: { type: 'resource', id: 1 },
      details: { introductionId: 3, usageUserId: 2, retrainingReason: 'age' },
    });
    expect(introductionStore.markRetrainingRequiredAudited).toHaveBeenCalledWith(3, expect.any(Date));
  });

  it('leaves the audit marker unset when the required transition was not recorded, so the next run retries', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'unavailable' }) };
    const { notify, introductionStore } = build({ resource: lathe, audit });

    await notify(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingNotifiedAt: new Date('2026-01-02T12:00:00.000Z') },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(introductionStore.markRetrainingRequiredAudited).not.toHaveBeenCalled();
  });

  it('records a group introduction transition with the resource group as subject', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const { notify } = build({ group: woodShop, audit });

    await notify(
      { id: 5, resourceId: null, resourceGroupId: 4, receiverUserId: 2, retrainingNotifiedAt: null },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'retraining.required', subject: { type: 'resource_group', id: 4 } }),
    );
  });

  it('retries failed email delivery without marking the notification delivered', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const email = {
      sendUserRetrainingEmail: jest
        .fn()
        .mockRejectedValueOnce(new Error('SMTP unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const { notify, introductionStore } = build({ resource: lathe, audit, email });
    const introduction = {
      id: 3,
      resourceId: 1,
      receiverUserId: 2,
      receiver: { id: 2, username: 'u', email: 'user@example.com', locale: 'en' },
      retrainingNotifiedAt: null,
      retrainingRequiredAuditedAt: new Date('2026-01-03T00:00:00.000Z'),
    };

    await expect(notify(introduction, new Date('2026-01-03T00:00:00.000Z'))).rejects.toThrow('SMTP unavailable');
    expect(introductionStore.markRetrainingNotified).not.toHaveBeenCalled();
    await notify(introduction, new Date('2026-01-04T00:00:00.000Z'));
    expect(email.sendUserRetrainingEmail).toHaveBeenCalledTimes(2);
    expect(audit.record).not.toHaveBeenCalled();
    expect(introductionStore.markRetrainingNotified).toHaveBeenCalledWith(3, expect.any(Date));
  });

  it('retries a missing required event after the email has been delivered', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const email = { sendUserRetrainingEmail: jest.fn() };
    const { notify, introductionStore } = build({ resource: lathe, audit, email });

    await notify(
      {
        id: 3,
        resourceId: 1,
        receiverUserId: 2,
        receiver: { id: 2, username: 'u', email: 'user@example.com', locale: 'en' },
        retrainingNotifiedAt: new Date('2026-01-03T00:00:00.000Z'),
        retrainingRequiredAuditedAt: null,
      },
      new Date('2026-01-04T00:00:00.000Z'),
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(email.sendUserRetrainingEmail).not.toHaveBeenCalled();
    expect(introductionStore.markRetrainingRequiredAudited).toHaveBeenCalledWith(3, expect.any(Date));
  });

  it('does not record retraining for a revoked introduction', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const { notify } = build({ audit, lastHistory: { action: IntroductionHistoryAction.REVOKE } });

    await notify({ id: 3, resourceId: 1, receiverUserId: 2 }, new Date('2026-01-03T00:00:00.000Z'));

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('uses the introduction marker after audit retention has removed the audit row', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const { notify } = build({ resource: lathe, audit });

    await notify(
      { id: 3, resourceId: 1, receiverUserId: 2, retrainingRequiredAuditedAt: fixture.trainedAt },
      new Date('2026-01-03T00:00:00.000Z'),
    );

    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ResourceRetrainingService status aggregation', () => {
  const fixture = registerResourceRetrainingServiceStatusAggregationFixture();

  it('combines expired resource and group introductions into a blocked status', async () => {
    const { service } = fixture.setup();
    expect(await service.getResourceRetrainingStatus(1, 4)).toMatchObject({
      hasIntroduction: true,
      applies: true,
      isDue: true,
      blocksAccess: true,
      reason: 'age',
    });
  });

  it('keeps a fresh group introduction usable when the resource introduction is expired', async () => {
    const { service, groups } = fixture.setup();
    groups.findOne.mockResolvedValue({
      id: 2,
      ...fixture.policy,
      retrainingMaxAgeDays: 100000,
      resources: [{ id: 1 }],
    });
    expect(await service.getResourceRetrainingStatus(1, 4)).toMatchObject({
      hasIntroduction: true,
      isDue: false,
      blocksAccess: false,
    });
  });

  it('reports no applicable policy without incorrectly dropping an existing introduction', async () => {
    const { service, resources, groups } = fixture.setup();
    resources.findOne.mockResolvedValue({ id: 1, ...fixture.policy, retrainingMaxAgeDays: null });
    groups.findOne.mockResolvedValue({ id: 2, ...fixture.policy, retrainingMaxAgeDays: null, resources: [] });
    expect(await service.getResourceRetrainingStatus(1, 4)).toMatchObject({
      hasIntroduction: true,
      applies: false,
      isDue: false,
    });
  });

  it('reports missing or revoked introductions as unavailable', async () => {
    const { service, introductions, history } = fixture.setup();
    introductions.findOne.mockResolvedValue(null);
    expect(await service.getResourceRetrainingStatus(1, 4)).toMatchObject({ hasIntroduction: false });
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
    introductions.findOne.mockResolvedValue({ id: 3, resourceId: 1, receiverUserId: 4, createdAt: fixture.trainedAt });
    history.findOne.mockResolvedValue(null);
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
  });

  it('evaluates individual resource and group introductions and tolerates deleted targets', async () => {
    const { service, introductions, resources, groups } = fixture.setup();
    expect(await service.getIntroductionRetrainingStatus(3)).toMatchObject({ isDue: true });
    introductions.findOne.mockResolvedValue({
      id: 3,
      resourceId: null,
      resourceGroupId: 2,
      receiverUserId: 4,
      createdAt: fixture.trainedAt,
    });
    expect(await service.getIntroductionRetrainingStatus(3)).toMatchObject({ isDue: true });
    groups.findOne.mockResolvedValue(null);
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
    introductions.findOne.mockResolvedValue({ id: 3, resourceId: 1, receiverUserId: 4, createdAt: fixture.trainedAt });
    resources.findOne.mockResolvedValue(null);
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
  });
});
