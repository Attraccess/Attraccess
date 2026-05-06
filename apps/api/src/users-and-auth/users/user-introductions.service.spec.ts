// Unit tests for UserIntroductionsService self-service expiring aggregation
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ResourceIntroduction } from '@attraccess/database-entities';
import { IntroductionScheduleEvaluatorService } from '../../resources/introductions/schedules/introduction-schedule-evaluator.service';
import { UserIntroductionsService } from './user-introductions.service';
import { IntroductionStatus } from '../../resources/introductions/dtos/introductionStatus.response.dto';

describe('UserIntroductionsService', () => {
  let svc: UserIntroductionsService;
  let introRepo: { find: jest.Mock };
  let evaluator: { evaluateIntroduction: jest.Mock };

  beforeEach(async () => {
    introRepo = { find: jest.fn() };
    evaluator = { evaluateIntroduction: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        UserIntroductionsService,
        { provide: getRepositoryToken(ResourceIntroduction), useValue: introRepo },
        { provide: IntroductionScheduleEvaluatorService, useValue: evaluator },
      ],
    }).compile();
    svc = mod.get(UserIntroductionsService);
  });

  it('returns empty list when user has no introductions', async () => {
    introRepo.find.mockResolvedValue([]);
    const out = await svc.findMyExpiring(1);
    expect(out).toEqual([]);
  });

  it('skips ACTIVE introductions', async () => {
    introRepo.find.mockResolvedValue([
      {
        id: 10,
        resourceId: 100,
        resourceGroupId: null,
        resource: { id: 100, name: 'Laser Cutter' },
        resourceGroup: null,
      },
    ]);
    evaluator.evaluateIntroduction.mockResolvedValue({
      status: 'ACTIVE',
      expiresAt: null,
      schedules: [],
    });
    const out = await svc.findMyExpiring(1);
    expect(out).toEqual([]);
  });

  it('returns one row for an EXPIRED resource introduction', async () => {
    const due = new Date('2026-01-01T00:00:00.000Z');
    introRepo.find.mockResolvedValue([
      {
        id: 10,
        resourceId: 100,
        resourceGroupId: null,
        resource: { id: 100, name: 'Laser Cutter' },
        resourceGroup: null,
      },
    ]);
    evaluator.evaluateIntroduction.mockResolvedValue({
      status: 'EXPIRED',
      expiresAt: due,
      schedules: [{ scheduleId: 1, dueAt: due, isDue: true, isWarning: false, blockAccess: true }],
    });
    const out = await svc.findMyExpiring(1);
    expect(out).toEqual([
      {
        kind: 'resource',
        resourceId: 100,
        resourceGroupId: undefined,
        name: 'Laser Cutter',
        status: IntroductionStatus.EXPIRED,
        dueAt: due.toISOString(),
      },
    ]);
  });

  it('returns one row for a WARNING resource group introduction', async () => {
    const due = new Date('2026-06-01T00:00:00.000Z');
    introRepo.find.mockResolvedValue([
      {
        id: 11,
        resourceId: null,
        resourceGroupId: 50,
        resource: null,
        resourceGroup: { id: 50, name: 'Wood Shop' },
      },
    ]);
    evaluator.evaluateIntroduction.mockResolvedValue({
      status: 'WARNING',
      expiresAt: due,
      schedules: [{ scheduleId: 2, dueAt: due, isDue: false, isWarning: true, blockAccess: false }],
    });
    const out = await svc.findMyExpiring(1);
    expect(out).toEqual([
      {
        kind: 'resourceGroup',
        resourceId: undefined,
        resourceGroupId: 50,
        name: 'Wood Shop',
        status: IntroductionStatus.WARNING,
        dueAt: due.toISOString(),
      },
    ]);
  });

  it('mixes ACTIVE, WARNING and EXPIRED entries correctly', async () => {
    introRepo.find.mockResolvedValue([
      { id: 1, resourceId: 1, resource: { name: 'A' }, resourceGroup: null, resourceGroupId: null },
      { id: 2, resourceId: 2, resource: { name: 'B' }, resourceGroup: null, resourceGroupId: null },
      { id: 3, resourceId: 3, resource: { name: 'C' }, resourceGroup: null, resourceGroupId: null },
    ]);
    evaluator.evaluateIntroduction
      .mockResolvedValueOnce({ status: 'ACTIVE', expiresAt: null, schedules: [] })
      .mockResolvedValueOnce({ status: 'WARNING', expiresAt: new Date('2026-06-01T00:00:00.000Z'), schedules: [] })
      .mockResolvedValueOnce({ status: 'EXPIRED', expiresAt: new Date('2026-01-01T00:00:00.000Z'), schedules: [] });
    const out = await svc.findMyExpiring(1);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.status)).toEqual([IntroductionStatus.WARNING, IntroductionStatus.EXPIRED]);
    expect(out.map((r) => r.name)).toEqual(['B', 'C']);
  });
});
