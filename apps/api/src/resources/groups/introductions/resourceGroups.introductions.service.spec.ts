import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Repository, Not, In } from 'typeorm';
import { ResourceGroupsIntroductionsService } from './resourceGroups.introductions.service';
import { IntroductionScheduleEvaluatorService } from '../../introductions/schedules/introduction-schedule-evaluator.service';

describe('ResourceGroupsIntroductionsService', () => {
  let service: ResourceGroupsIntroductionsService;
  let introRepo: jest.Mocked<Repository<ResourceIntroduction>>;
  let historyRepo: jest.Mocked<Repository<ResourceIntroductionHistoryItem>>;
  let evaluator: { isBlockedByExpiry: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  });

  beforeEach(async () => {
    evaluator = { isBlockedByExpiry: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroductionsService,
        { provide: getRepositoryToken(ResourceIntroduction), useFactory: mockRepository },
        { provide: getRepositoryToken(ResourceIntroductionHistoryItem), useFactory: mockRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: IntroductionScheduleEvaluatorService, useValue: evaluator },
      ],
    }).compile();

    service = moduleRef.get(ResourceGroupsIntroductionsService);
    introRepo = moduleRef.get(getRepositoryToken(ResourceIntroduction));
    historyRepo = moduleRef.get(getRepositoryToken(ResourceIntroductionHistoryItem));
  });

  describe('hasValidIntroduction with expiry', () => {
    it('returns false when blocking schedule is due', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(true);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.GRANT,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction({ groupId: 1, userId: 2 })).toBe(false);
    });

    it('returns true when due but blockAccess=false (evaluator returns false)', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.GRANT,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction({ groupId: 1, userId: 2 })).toBe(true);
    });

    it('treats RENEW as valid grant', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.RENEW,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction({ groupId: 1, userId: 2 })).toBe(true);
    });

    it('ignores EXPIRE/WARN_SENT history when finding last user-action', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.GRANT,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction({ groupId: 1, userId: 2 })).toBe(true);
      expect(historyRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: Not(In([IntroductionHistoryAction.EXPIRE, IntroductionHistoryAction.WARN_SENT])),
          }),
        }),
      );
    });
  });
});
