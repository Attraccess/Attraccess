import {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
} from '@attraccess/database-entities';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceRetrainingPolicyImplementation } from './resource-retraining-policy';
import {
  EMPTY_EVALUATION,
  ResourceRetrainingStatus,
  RetrainingEvaluation,
  RetrainingPolicy,
  RetrainingReason,
} from './resourceRetraining.service.feature-definitions';

@Injectable()
export class ResourceRetrainingService extends ResourceRetrainingPolicyImplementation {
  protected readonly logger = new Logger(ResourceRetrainingService.name);

  constructor(
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceGroup)
    protected readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(ResourceUsage)
    protected readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(ResourceIntroduction)
    protected readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    protected readonly historyRepository: Repository<ResourceIntroductionHistoryItem>,
    protected readonly resourceGroupsService: ResourceGroupsService,
    protected readonly emailService: EmailService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  public evaluate(
    policy: RetrainingPolicy,
    trainedAt: Date,
    lastUsedAt: Date | null,
    now: Date = new Date(),
  ): RetrainingEvaluation {
    const candidates: Array<{ dueAt: Date; reason: RetrainingReason }> = [];

    if (policy.retrainingMaxAgeDays != null) {
      candidates.push({ dueAt: this.addDays(trainedAt, policy.retrainingMaxAgeDays), reason: 'age' });
    }

    if (policy.retrainingMaxInactivityDays != null) {
      const inactivityBase = lastUsedAt ?? trainedAt;
      candidates.push({
        dueAt: this.addDays(inactivityBase, policy.retrainingMaxInactivityDays),
        reason: 'inactivity',
      });
    }

    if (candidates.length === 0) {
      return { ...EMPTY_EVALUATION, blocksAccess: policy.retrainingBlocksAccess };
    }

    const soonest = candidates.reduce((a, b) => (a.dueAt.getTime() <= b.dueAt.getTime() ? a : b));
    return {
      applies: true,
      isDue: now.getTime() >= soonest.dueAt.getTime(),
      blocksAccess: policy.retrainingBlocksAccess,
      dueAt: soonest.dueAt,
      reason: soonest.reason,
    };
  }

  public async getResourceRetrainingStatus(resourceId: number, userId: number): Promise<ResourceRetrainingStatus> {
    const now = new Date();
    const evaluations: RetrainingEvaluation[] = [];

    const resourceEval = await this.evaluateResourceIntroduction(resourceId, userId, now);
    if (resourceEval) {
      evaluations.push(resourceEval);
    }

    const groups = await this.resourceGroupsService.getGroupsOfResource(resourceId);
    for (const group of groups) {
      const groupEval = await this.evaluateGroupIntroduction(group.id, userId, now);
      if (groupEval) {
        evaluations.push(groupEval);
      }
    }

    if (evaluations.length === 0) {
      return { ...EMPTY_EVALUATION, hasIntroduction: false };
    }

    return { ...this.combine(evaluations), hasIntroduction: true };
  }

  public async getGroupRetrainingStatus(groupId: number, userId: number): Promise<ResourceRetrainingStatus> {
    const evaluation = await this.evaluateGroupIntroduction(groupId, userId, new Date());
    return evaluation ? { ...evaluation, hasIntroduction: true } : { ...EMPTY_EVALUATION, hasIntroduction: false };
  }

  public async isResourceIntroductionBlocked(resourceId: number, userId: number): Promise<boolean> {
    const evaluation = await this.evaluateResourceIntroduction(resourceId, userId, new Date());
    return Boolean(evaluation && evaluation.applies && evaluation.isDue && evaluation.blocksAccess);
  }

  public async isGroupIntroductionBlocked(groupId: number, userId: number): Promise<boolean> {
    const evaluation = await this.evaluateGroupIntroduction(groupId, userId, new Date());
    return Boolean(evaluation && evaluation.applies && evaluation.isDue && evaluation.blocksAccess);
  }
}

export {
  ResourceRetrainingStatus,
  RetrainingEvaluation,
  RetrainingPolicy,
  RetrainingReason,
} from './resourceRetraining.service.feature-definitions';
