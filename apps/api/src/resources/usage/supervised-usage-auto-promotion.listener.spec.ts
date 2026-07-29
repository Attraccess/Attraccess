import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, IsNull, Not } from 'typeorm';
import { AutoIntroductionTarget, Resource, ResourceUsage } from '@attraccess/database-entities';
import { SupervisedUsageAutoPromotionListener } from './supervised-usage-auto-promotion.listener';
import { ResourceSupervisedUsageEndedEvent } from './events/resource-usage.events';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';

describe('SupervisedUsageAutoPromotionListener', () => {
  let listener: SupervisedUsageAutoPromotionListener;
  let usageRepository: { count: jest.Mock };
  let resourceRepository: { findOne: jest.Mock; find: jest.Mock };
  let introductionsService: { hasValidIntroduction: jest.Mock; grant: jest.Mock };
  let groupIntroductionsService: { hasValidIntroduction: jest.Mock; grant: jest.Mock };

  const RESOURCE_ID = 7;
  const USER_ID = 11;
  const SUPERVISOR_ID = 22;
  const GROUP_ID = 3;

  const buildResource = (overrides: Partial<Resource> = {}): Resource =>
    ({
      id: RESOURCE_ID,
      supervisedUsagesUntilIntroduction: 3,
      autoIntroductionTarget: AutoIntroductionTarget.RESOURCE,
      autoIntroductionGroupId: null,
      ...overrides,
    } as Resource);

  const event = new ResourceSupervisedUsageEndedEvent(RESOURCE_ID, USER_ID, SUPERVISOR_ID, 99);

  beforeEach(async () => {
    usageRepository = { count: jest.fn().mockResolvedValue(0) };
    resourceRepository = {
      findOne: jest.fn().mockResolvedValue(buildResource()),
      find: jest.fn().mockResolvedValue([]),
    };
    introductionsService = {
      hasValidIntroduction: jest.fn().mockResolvedValue(false),
      grant: jest.fn().mockResolvedValue(undefined),
    };
    groupIntroductionsService = {
      hasValidIntroduction: jest.fn().mockResolvedValue(false),
      grant: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisedUsageAutoPromotionListener,
        { provide: getRepositoryToken(ResourceUsage), useValue: usageRepository },
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: ResourceIntroductionsService, useValue: introductionsService },
        { provide: ResourceGroupsIntroductionsService, useValue: groupIntroductionsService },
      ],
    }).compile();

    listener = module.get(SupervisedUsageAutoPromotionListener);
  });

  describe('RESOURCE target', () => {
    it('grants a resource introduction once the threshold is reached, with the supervisor as tutor', async () => {
      usageRepository.count.mockResolvedValue(3);

      await listener.handleSupervisedUsageEnded(event);

      expect(usageRepository.count).toHaveBeenCalledWith({
        where: {
          resourceId: RESOURCE_ID,
          userId: USER_ID,
          supervisorUserId: Not(IsNull()),
          endTime: Not(IsNull()),
        },
      });
      expect(introductionsService.grant).toHaveBeenCalledWith(RESOURCE_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
      });
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('does not grant when the threshold has not been reached', async () => {
      usageRepository.count.mockResolvedValue(2);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('is idempotent: skips when a valid introduction already exists', async () => {
      usageRepository.count.mockResolvedValue(5);
      introductionsService.hasValidIntroduction.mockResolvedValue(true);

      await listener.handleSupervisedUsageEnded(event);

      expect(usageRepository.count).not.toHaveBeenCalled();
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('defaults to a resource introduction when the target is null', async () => {
      resourceRepository.findOne.mockResolvedValue(buildResource({ autoIntroductionTarget: null }));
      usageRepository.count.mockResolvedValue(3);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).toHaveBeenCalledWith(RESOURCE_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
      });
    });
  });

  describe('GROUP target', () => {
    const groupResource = () =>
      buildResource({ autoIntroductionTarget: AutoIntroductionTarget.GROUP, autoIntroductionGroupId: GROUP_ID });

    it('counts supervised usages summed across all resources in the group and grants a group introduction', async () => {
      resourceRepository.findOne.mockResolvedValue(groupResource());
      resourceRepository.find.mockResolvedValue([{ id: 7 }, { id: 8 }, { id: 9 }] as Resource[]);
      usageRepository.count.mockResolvedValue(3); // group-wide sum across the three resources

      await listener.handleSupervisedUsageEnded(event);

      expect(usageRepository.count).toHaveBeenCalledWith({
        where: {
          resourceId: In([7, 8, 9]),
          userId: USER_ID,
          supervisorUserId: Not(IsNull()),
          endTime: Not(IsNull()),
        },
      });
      expect(groupIntroductionsService.grant).toHaveBeenCalledWith(GROUP_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
      });
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('does not grant when the group-wide sum is below the threshold', async () => {
      resourceRepository.findOne.mockResolvedValue(groupResource());
      resourceRepository.find.mockResolvedValue([{ id: 7 }, { id: 8 }] as Resource[]);
      usageRepository.count.mockResolvedValue(2);

      await listener.handleSupervisedUsageEnded(event);

      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('is idempotent: skips when a valid group introduction already exists', async () => {
      resourceRepository.findOne.mockResolvedValue(groupResource());
      groupIntroductionsService.hasValidIntroduction.mockResolvedValue(true);

      await listener.handleSupervisedUsageEnded(event);

      expect(resourceRepository.find).not.toHaveBeenCalled();
      expect(usageRepository.count).not.toHaveBeenCalled();
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('skips when the group target has no autoIntroductionGroupId', async () => {
      resourceRepository.findOne.mockResolvedValue(
        groupResource() && buildResource({ autoIntroductionTarget: AutoIntroductionTarget.GROUP, autoIntroductionGroupId: null }),
      );

      await listener.handleSupervisedUsageEnded(event);

      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });
  });

  describe('auto-promotion disabled', () => {
    it('does nothing when supervisedUsagesUntilIntroduction is null', async () => {
      resourceRepository.findOne.mockResolvedValue(buildResource({ supervisedUsagesUntilIntroduction: null }));

      await listener.handleSupervisedUsageEnded(event);

      expect(usageRepository.count).not.toHaveBeenCalled();
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('does nothing when the resource no longer exists', async () => {
      resourceRepository.findOne.mockResolvedValue(null);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).not.toHaveBeenCalled();
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });
  });
});
