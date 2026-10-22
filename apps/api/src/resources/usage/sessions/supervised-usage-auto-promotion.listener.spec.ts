import { SupervisedUsageHistory } from '../persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { AutoIntroductionTarget, Resource } from '@attraccess/application-models';
import { SupervisedUsageAutoPromotionListener } from './supervised-usage-auto-promotion.listener';
import { ResourceSupervisedUsageEndedEvent } from '../events/resource-usage.events';
import { ResourceIntroductionsService } from '../../introductions/resouceIntroductions.service';
import { ResourceGroupsIntroductionsService } from '../../groups/introductions/resourceGroups.introductions.service';

describe('SupervisedUsageAutoPromotionListener', () => {
  let listener: SupervisedUsageAutoPromotionListener;
  let persistence: jest.Mocked<SupervisedUsageHistory>;
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
    }) as Resource;

  const event = new ResourceSupervisedUsageEndedEvent(RESOURCE_ID, USER_ID, SUPERVISOR_ID, 99);

  beforeEach(async () => {
    persistence = {
      resource: jest.fn().mockResolvedValue(buildResource()),
      completedCount: jest.fn().mockResolvedValue(0),
      groupResourceIds: jest.fn().mockResolvedValue([]),
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
        { provide: SupervisedUsageHistory, useValue: persistence },
        SupervisedUsageAutoPromotionListener,
        { provide: ResourceIntroductionsService, useValue: introductionsService },
        { provide: ResourceGroupsIntroductionsService, useValue: groupIntroductionsService },
      ],
    }).compile();

    listener = module.get(SupervisedUsageAutoPromotionListener);
  });

  describe('RESOURCE target', () => {
    it('grants a resource introduction once the threshold is reached, with the supervisor as tutor', async () => {
      persistence.completedCount.mockResolvedValue(3);

      await listener.handleSupervisedUsageEnded(event);

      expect(persistence.completedCount).toHaveBeenCalledWith([RESOURCE_ID], USER_ID);
      expect(introductionsService.grant).toHaveBeenCalledWith(RESOURCE_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
        performedByUserId: null,
        authenticationMethod: null,
      });
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('does not grant when the threshold has not been reached', async () => {
      persistence.completedCount.mockResolvedValue(2);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('is idempotent: skips when a valid introduction already exists', async () => {
      persistence.completedCount.mockResolvedValue(5);
      introductionsService.hasValidIntroduction.mockResolvedValue(true);

      await listener.handleSupervisedUsageEnded(event);

      expect(persistence.completedCount).not.toHaveBeenCalled();
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('defaults to a resource introduction when the target is null', async () => {
      persistence.resource.mockResolvedValue(buildResource({ autoIntroductionTarget: null }));
      persistence.completedCount.mockResolvedValue(3);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).toHaveBeenCalledWith(RESOURCE_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
        performedByUserId: null,
        authenticationMethod: null,
      });
    });
  });

  describe('GROUP target', () => {
    const groupResource = () =>
      buildResource({ autoIntroductionTarget: AutoIntroductionTarget.GROUP, autoIntroductionGroupId: GROUP_ID });

    it('counts supervised usages summed across all resources in the group and grants a group introduction', async () => {
      persistence.resource.mockResolvedValue(groupResource());
      persistence.groupResourceIds.mockResolvedValue([7, 8, 9]);
      persistence.completedCount.mockResolvedValue(3); // group-wide sum across the three resources

      await listener.handleSupervisedUsageEnded(event);

      expect(persistence.completedCount).toHaveBeenCalledWith([7, 8, 9], USER_ID);
      expect(groupIntroductionsService.grant).toHaveBeenCalledWith(GROUP_ID, USER_ID, undefined, {
        tutorUserId: SUPERVISOR_ID,
        performedByUserId: null,
        authenticationMethod: null,
      });
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('does not grant when the group-wide sum is below the threshold', async () => {
      persistence.resource.mockResolvedValue(groupResource());
      persistence.groupResourceIds.mockResolvedValue([7, 8]);
      persistence.completedCount.mockResolvedValue(2);

      await listener.handleSupervisedUsageEnded(event);

      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('is idempotent: skips when a valid group introduction already exists', async () => {
      persistence.resource.mockResolvedValue(groupResource());
      groupIntroductionsService.hasValidIntroduction.mockResolvedValue(true);

      await listener.handleSupervisedUsageEnded(event);

      expect(persistence.groupResourceIds).not.toHaveBeenCalled();
      expect(persistence.completedCount).not.toHaveBeenCalled();
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });

    it('skips when the group target has no autoIntroductionGroupId', async () => {
      persistence.resource.mockResolvedValue(
        groupResource() &&
          buildResource({ autoIntroductionTarget: AutoIntroductionTarget.GROUP, autoIntroductionGroupId: null }),
      );

      await listener.handleSupervisedUsageEnded(event);

      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });
  });

  describe('auto-promotion disabled', () => {
    it('does nothing when supervisedUsagesUntilIntroduction is null', async () => {
      persistence.resource.mockResolvedValue(buildResource({ supervisedUsagesUntilIntroduction: null }));

      await listener.handleSupervisedUsageEnded(event);

      expect(persistence.completedCount).not.toHaveBeenCalled();
      expect(introductionsService.grant).not.toHaveBeenCalled();
    });

    it('does nothing when the resource no longer exists', async () => {
      persistence.resource.mockResolvedValue(null);

      await listener.handleSupervisedUsageEnded(event);

      expect(introductionsService.grant).not.toHaveBeenCalled();
      expect(groupIntroductionsService.grant).not.toHaveBeenCalled();
    });
  });
});
