// CRUD service for ResourceIntroductionSchedule (resource and group scopes)
// FEATURE: User retraining requirement (ATT-106)
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  Resource,
  ResourceGroup,
} from '@attraccess/database-entities';
import { CreateIntroductionScheduleDto } from './dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from './dtos/update-introduction-schedule.dto';

export interface ScheduleScope {
  resourceId?: number;
  resourceGroupId?: number;
}

interface ConfigPayload {
  timeSinceIntroductionConfig?: { duration: number; unit: RetrainingIntervalUnit };
  inactivityConfig?: {
    duration: number;
    unit: RetrainingIntervalUnit;
    scope: ResourceIntroductionScheduleInactivityScope;
  };
}

@Injectable()
export class IntroductionScheduleService {
  constructor(
    @InjectRepository(ResourceIntroductionSchedule)
    private readonly scheduleRepo: Repository<ResourceIntroductionSchedule>,
    @InjectRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig)
    private readonly timeConfigRepo: Repository<ResourceIntroductionScheduleTimeSinceIntroductionConfig>,
    @InjectRepository(ResourceIntroductionScheduleInactivityConfig)
    private readonly inactivityConfigRepo: Repository<ResourceIntroductionScheduleInactivityConfig>,
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceGroup) private readonly groupRepo: Repository<ResourceGroup>
  ) {}

  async findAll(scope: ScheduleScope): Promise<ResourceIntroductionSchedule[]> {
    await this.assertScope(scope);
    return this.scheduleRepo.find({
      where: this.scopeWhere(scope),
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
      order: { id: 'ASC' },
    });
  }

  async getOne(scope: ScheduleScope, scheduleId: number): Promise<ResourceIntroductionSchedule> {
    const s = await this.scheduleRepo.findOne({
      where: { id: scheduleId, ...this.scopeWhere(scope) },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    if (!s) throw new NotFoundException('Introduction schedule not found');
    return s;
  }

  async create(scope: ScheduleScope, dto: CreateIntroductionScheduleDto): Promise<ResourceIntroductionSchedule> {
    await this.assertScope(scope);
    const created = this.scheduleRepo.create({
      resourceId: scope.resourceId ?? null,
      resourceGroupId: scope.resourceGroupId ?? null,
      name: dto.name ?? null,
      triggerType: dto.triggerType,
      blockAccess: dto.blockAccess ?? false,
      warnDaysBefore: dto.warnDaysBefore ?? 0,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.scheduleRepo.save(created);
    await this.upsertConfig(saved.id, dto.triggerType, dto);
    return this.getOne(scope, saved.id);
  }

  async update(
    scope: ScheduleScope,
    scheduleId: number,
    dto: UpdateIntroductionScheduleDto
  ): Promise<ResourceIntroductionSchedule> {
    const existing = await this.getOne(scope, scheduleId);
    if (dto.name !== undefined) existing.name = dto.name ?? null;
    if (dto.enabled !== undefined) existing.enabled = dto.enabled;
    if (dto.blockAccess !== undefined) existing.blockAccess = dto.blockAccess;
    if (dto.warnDaysBefore !== undefined) existing.warnDaysBefore = dto.warnDaysBefore;
    const triggerType = dto.triggerType ?? existing.triggerType;
    existing.triggerType = triggerType;
    await this.scheduleRepo.save(existing);

    if (
      dto.triggerType !== undefined ||
      dto.timeSinceIntroductionConfig !== undefined ||
      dto.inactivityConfig !== undefined
    ) {
      await this.timeConfigRepo.delete({ scheduleId });
      await this.inactivityConfigRepo.delete({ scheduleId });
      await this.upsertConfig(scheduleId, triggerType, dto);
    }
    return this.getOne(scope, scheduleId);
  }

  async delete(scope: ScheduleScope, scheduleId: number): Promise<void> {
    const s = await this.getOne(scope, scheduleId);
    await this.scheduleRepo.remove(s);
  }

  private async upsertConfig(
    scheduleId: number,
    triggerType: ResourceIntroductionScheduleTriggerType,
    dto: ConfigPayload
  ): Promise<void> {
    if (triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION) {
      if (!dto.timeSinceIntroductionConfig) {
        throw new BadRequestException('timeSinceIntroductionConfig required');
      }
      await this.timeConfigRepo.save(
        this.timeConfigRepo.create({ scheduleId, ...dto.timeSinceIntroductionConfig })
      );
    } else if (triggerType === ResourceIntroductionScheduleTriggerType.INACTIVITY) {
      if (!dto.inactivityConfig) throw new BadRequestException('inactivityConfig required');
      await this.inactivityConfigRepo.save(
        this.inactivityConfigRepo.create({ scheduleId, ...dto.inactivityConfig })
      );
    }
  }

  private scopeWhere(scope: ScheduleScope) {
    if (scope.resourceId != null) return { resourceId: scope.resourceId };
    if (scope.resourceGroupId != null) return { resourceGroupId: scope.resourceGroupId };
    throw new BadRequestException('Either resourceId or resourceGroupId required');
  }

  private async assertScope(scope: ScheduleScope): Promise<void> {
    if (scope.resourceId != null) {
      if (!(await this.resourceRepo.findOne({ where: { id: scope.resourceId } }))) {
        throw new NotFoundException(`Resource ${scope.resourceId} not found`);
      }
    } else if (scope.resourceGroupId != null) {
      if (!(await this.groupRepo.findOne({ where: { id: scope.resourceGroupId } }))) {
        throw new NotFoundException(`Resource group ${scope.resourceGroupId} not found`);
      }
    } else {
      throw new BadRequestException('Either resourceId or resourceGroupId required');
    }
  }
}
