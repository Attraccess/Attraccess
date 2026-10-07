import { registerResourceRetrainingServiceStatusAggregationFixture } from './resourceRetraining.service.resource-retraining-service-status-aggregation.test-fixture';

export function registerCombinesExpiredResourceAndGroupIntroductionsIntoABlockedStatusCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceStatusAggregationFixture>,
) {
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
}

export function registerEvaluatesIndividualResourceAndGroupIntroductionsAndToleratesDeletedTargetsCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceStatusAggregationFixture>,
) {
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
}

export function registerKeepsAFreshGroupIntroductionUsableWhenTheResourceIntroductionIsExpiredCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceStatusAggregationFixture>,
) {
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
}

export function registerReportsMissingOrRevokedIntroductionsAsUnavailableCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceStatusAggregationFixture>,
) {
  it('reports missing or revoked introductions as unavailable', async () => {
    const { service, introductions, history } = fixture.setup();
    introductions.findOne.mockResolvedValue(null);
    expect(await service.getResourceRetrainingStatus(1, 4)).toMatchObject({ hasIntroduction: false });
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
    introductions.findOne.mockResolvedValue({ id: 3, resourceId: 1, receiverUserId: 4, createdAt: fixture.trainedAt });
    history.findOne.mockResolvedValue(null);
    expect(await service.getIntroductionRetrainingStatus(3)).toBeNull();
  });
}

export function registerReportsNoApplicablePolicyWithoutIncorrectlyDroppingAnExistingIntroductionCases(
  fixture: ReturnType<typeof registerResourceRetrainingServiceStatusAggregationFixture>,
) {
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
}
