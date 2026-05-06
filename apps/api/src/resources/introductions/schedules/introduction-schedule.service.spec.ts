// Service unit tests for introduction schedule CRUD
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  ResourceType,
  RetrainingIntervalUnit,
  entities,
} from '@attraccess/database-entities';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { NotFoundException } from '@nestjs/common';

describe('IntroductionScheduleService (resource scope)', () => {
  let ds: DataSource;
  let svc: IntroductionScheduleService;
  let resourceId: number;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: Object.values(entities),
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          ResourceIntroductionSchedule,
          ResourceIntroductionScheduleTimeSinceIntroductionConfig,
          ResourceIntroductionScheduleInactivityConfig,
          Resource,
          ResourceGroup,
        ]),
      ],
      providers: [IntroductionScheduleService],
    }).compile();

    ds = moduleRef.get(getDataSourceToken());
    svc = moduleRef.get(IntroductionScheduleService);
    const r = await ds.getRepository(Resource).save({ name: 'R1', type: ResourceType.Machine });
    resourceId = r.id;
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('creates TIME_SINCE_INTRODUCTION schedule', async () => {
    const s = await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
        blockAccess: true,
        warnDaysBefore: 30,
      }
    );
    expect(s.id).toBeDefined();
    expect(s.timeSinceIntroductionConfig?.duration).toBe(1);
    expect(s.inactivityConfig).toBeFalsy();
    expect(s.blockAccess).toBe(true);
  });

  it('creates INACTIVITY schedule', async () => {
    const s = await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
        inactivityConfig: {
          duration: 6,
          unit: RetrainingIntervalUnit.MONTHS,
          scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
        },
      }
    );
    expect(s.inactivityConfig?.scope).toBe('RESOURCE');
    expect(s.timeSinceIntroductionConfig).toBeFalsy();
  });

  it('lists schedules for resource', async () => {
    await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
      }
    );
    await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
        inactivityConfig: {
          duration: 6,
          unit: RetrainingIntervalUnit.MONTHS,
          scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
        },
      }
    );
    const list = await svc.findAll({ resourceId });
    expect(list).toHaveLength(2);
  });

  it('throws when resource not found on list', async () => {
    await expect(svc.findAll({ resourceId: 9999 })).rejects.toThrow(NotFoundException);
  });

  it('updates schedule swapping trigger type cleans old config', async () => {
    const s = await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
      }
    );
    const upd = await svc.update({ resourceId }, s.id, {
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      inactivityConfig: {
        duration: 30,
        unit: RetrainingIntervalUnit.DAYS,
        scope: ResourceIntroductionScheduleInactivityScope.GROUP,
      },
    });
    expect(upd.timeSinceIntroductionConfig).toBeFalsy();
    expect(upd.inactivityConfig?.duration).toBe(30);
  });

  it('deletes schedule cascades configs', async () => {
    const s = await svc.create(
      { resourceId },
      {
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
      }
    );
    await svc.delete({ resourceId }, s.id);
    const remaining = await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).find();
    expect(remaining).toHaveLength(0);
  });
});
