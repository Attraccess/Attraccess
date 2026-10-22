import { retrainingOperationsFake } from './persistence/operations.test-fixture';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { IntroductionHistoryAction } from '@attraccess/application-models';

export function registerResourceRetrainingServiceStatusAggregationFixture() {
  const trainedAt = new Date('2020-01-01T00:00:00Z');

  const policy = { retrainingMaxAgeDays: 1, retrainingMaxInactivityDays: null, retrainingBlocksAccess: true };

  const setup = () => {
    const resource = jest.fn().mockResolvedValue({ id: 1, ...policy });
    const group = jest.fn().mockResolvedValue({ id: 2, ...policy, resources: [{ id: 1 }] });
    const introduction = jest.fn().mockResolvedValue({ id: 3, resourceId: 1, receiverUserId: 4, createdAt: trainedAt });
    const persistence = retrainingOperationsFake({
      resource,
      group,
      groupWithResources: group,
      introduction,
      resourceIntroduction: introduction,
      groupIntroduction: introduction,
      latestHistory: jest.fn().mockResolvedValue({ action: IntroductionHistoryAction.GRANT, createdAt: trainedAt }),
      resourceLastUsedAt: jest.fn().mockResolvedValue(null),
      resourcesLastUsedAt: jest.fn().mockResolvedValue(null),
    });
    const resourceGroups = { getGroupsOfResource: jest.fn().mockResolvedValue([{ id: 2 }]) };
    const service = new ResourceRetrainingService(persistence, resourceGroups as never, {} as never, {} as never);
    return { service, persistence, resourceGroups };
  };
  return {
    get trainedAt() {
      return trainedAt;
    },
    get policy() {
      return policy;
    },
    get setup() {
      return setup;
    },
  };
}
