import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Repository, Not, In } from 'typeorm';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { MetricsService } from '../../metrics/metrics.service';
import { IntroductionScheduleEvaluatorService } from './schedules/introduction-schedule-evaluator.service';
import { ResourceIntroductionChangedEvent } from './events/resource-introduction-changed.event';

describe('ResourceIntroductionsService', () => {
  let service: ResourceIntroductionsService;
  let introRepo: jest.Mocked<Repository<ResourceIntroduction>>;
  let historyRepo: jest.Mocked<Repository<ResourceIntroductionHistoryItem>>;
  let evaluator: { isBlockedByExpiry: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let metricsService: { resourceIntroductionsTotal: { inc: jest.Mock } };

  const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  });

  beforeEach(async () => {
    evaluator = { isBlockedByExpiry: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    metricsService = { resourceIntroductionsTotal: { inc: jest.fn() } };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceIntroductionsService,
        { provide: getRepositoryToken(ResourceIntroduction), useFactory: mockRepository },
        { provide: getRepositoryToken(ResourceIntroductionHistoryItem), useFactory: mockRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MetricsService, useValue: metricsService },
        { provide: IntroductionScheduleEvaluatorService, useValue: evaluator },
      ],
    }).compile();

    service = moduleRef.get(ResourceIntroductionsService);
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
      expect(await service.hasValidIntroduction(1, 2)).toBe(false);
    });

    it('returns true when due but blockAccess=false (evaluator returns false)', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.GRANT,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction(1, 2)).toBe(true);
    });

    it('treats RENEW as valid grant', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.RENEW,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction(1, 2)).toBe(true);
    });

    it('ignores EXPIRE/WARN_SENT history when finding last user-action', async () => {
      evaluator.isBlockedByExpiry.mockResolvedValue(false);
      historyRepo.findOne.mockResolvedValue({
        action: IntroductionHistoryAction.GRANT,
      } as ResourceIntroductionHistoryItem);
      introRepo.findOne.mockResolvedValue({ id: 1 } as ResourceIntroduction);
      expect(await service.hasValidIntroduction(1, 2)).toBe(true);
      expect(historyRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: Not(In([IntroductionHistoryAction.EXPIRE, IntroductionHistoryAction.WARN_SENT])),
          }),
        }),
      );
    });
  });

  describe('renew', () => {
    it('appends a RENEW history item', async () => {
      introRepo.findOne.mockResolvedValue({ id: 5 } as ResourceIntroduction);
      historyRepo.create.mockImplementation((x: Partial<ResourceIntroductionHistoryItem>) => x as ResourceIntroductionHistoryItem);
      historyRepo.save.mockImplementation((x: Partial<ResourceIntroductionHistoryItem>) =>
        Promise.resolve({ ...x, id: 100, createdAt: new Date() } as ResourceIntroductionHistoryItem),
      );
      const result = await service.renew(1, 2, { comment: 'OK' });
      expect(result.action).toBe(IntroductionHistoryAction.RENEW);
      expect(historyRepo.save).toHaveBeenCalled();
    });

    it('emits ResourceIntroductionChangedEvent', async () => {
      introRepo.findOne.mockResolvedValue({ id: 5 } as ResourceIntroduction);
      historyRepo.create.mockImplementation((x: Partial<ResourceIntroductionHistoryItem>) => x as ResourceIntroductionHistoryItem);
      historyRepo.save.mockImplementation((x: Partial<ResourceIntroductionHistoryItem>) =>
        Promise.resolve({ ...x, id: 100, createdAt: new Date() } as ResourceIntroductionHistoryItem),
      );
      await service.renew(1, 2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ResourceIntroductionChangedEvent.EVENT_NAME,
        expect.any(ResourceIntroductionChangedEvent),
      );
    });

    it('throws NotFound when no introduction exists', async () => {
      introRepo.findOne.mockResolvedValue(null);
      await expect(service.renew(1, 2)).rejects.toThrow(NotFoundException);
    });
  });
});
