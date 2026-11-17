import { ResourceRetrainingService } from './resourceRetraining.service';
import { IntroductionHistoryAction } from '@attraccess/application-models';

export function registerResourceRetrainingServiceStatusAggregationFixture() {
  const trainedAt = new Date('2020-01-01T00:00:00Z');

  const policy = { retrainingMaxAgeDays: 1, retrainingMaxInactivityDays: null, retrainingBlocksAccess: true };

  const setup = () => {
    const resources = { findOne: jest.fn().mockResolvedValue({ id: 1, ...policy }) };
    const groups = { findOne: jest.fn().mockResolvedValue({ id: 2, ...policy, resources: [{ id: 1 }] }) };
    const usage = { findOne: jest.fn().mockResolvedValue(null) };
    const introductions = {
      findOne: jest.fn().mockResolvedValue({ id: 3, resourceId: 1, receiverUserId: 4, createdAt: trainedAt }),
    };
    const history = {
      findOne: jest.fn().mockResolvedValue({ action: IntroductionHistoryAction.GRANT, createdAt: trainedAt }),
    };
    const resourceGroups = { getGroupsOfResource: jest.fn().mockResolvedValue([{ id: 2 }]) };
    const retrainingStore = {
      findResourceTarget: jest.fn(() => resources.findOne()),
      findGroupTarget: jest.fn(() => groups.findOne()),
      lastResourceUseAt: jest.fn(() => usage.findOne()),
      lastGroupUseAt: jest.fn(() => usage.findOne()),
    };
    const introductionStore = {
      findOfUser: jest.fn(() => introductions.findOne()),
      findOfGroupUser: jest.fn(() => introductions.findOne()),
      findById: jest.fn(() => introductions.findOne()),
      lastHistoryItem: jest.fn(() => history.findOne()),
      latestGrant: jest.fn(() => history.findOne()),
    };
    const service = new ResourceRetrainingService(
      retrainingStore as never,
      introductionStore as never,
      resourceGroups as never,
      {} as never,
      {} as never,
    );
    return { service, resources, groups, usage, introductions, history, resourceGroups };
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
