import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import {
  IntroductionHistoryAction,
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { EmailService } from '../../email/email.service';

export interface RetrainingPolicy {
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
}

export type RetrainingReason = 'age' | 'inactivity' | null;

export interface RetrainingEvaluation {
  applies: boolean;
  isDue: boolean;
  blocksAccess: boolean;
  dueAt: Date | null;
  reason: RetrainingReason;
}

export interface ResourceRetrainingStatus extends RetrainingEvaluation {
  hasIntroduction: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_EVALUATION: RetrainingEvaluation = {
  applies: false,
  isDue: false,
  blocksAccess: false,
  dueAt: null,
  reason: null,
};

@Injectable()
export class ResourceRetrainingService {
  private readonly logger = new Logger(ResourceRetrainingService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly historyRepository: Repository<ResourceIntroductionHistoryItem>,
    private readonly resourceGroupsService: ResourceGroupsService,
    private readonly emailService: EmailService,
  ) {}

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

  public async isResourceIntroductionBlocked(resourceId: number, userId: number): Promise<boolean> {
    const evaluation = await this.evaluateResourceIntroduction(resourceId, userId, new Date());
    return Boolean(evaluation && evaluation.applies && evaluation.isDue && evaluation.blocksAccess);
  }

  public async isGroupIntroductionBlocked(groupId: number, userId: number): Promise<boolean> {
    const evaluation = await this.evaluateGroupIntroduction(groupId, userId, new Date());
    return Boolean(evaluation && evaluation.applies && evaluation.isDue && evaluation.blocksAccess);
  }

  @Cron('0 3 * * *')
  public async evaluateAndNotify(): Promise<void> {
    const now = new Date();
    const introductions = await this.resourceIntroductionRepository.find({ relations: ['receiverUser'] });

    for (const introduction of introductions) {
      try {
        await this.notifyIfDue(introduction, now);
      } catch (error) {
        this.logger.error(`Failed to evaluate retraining for introduction ${introduction.id}`, (error as Error).stack);
      }
    }
  }

  private async notifyIfDue(introduction: ResourceIntroduction, now: Date): Promise<void> {
    const trainedAt = await this.getTrainedAt(introduction);
    if (!trainedAt) {
      return;
    }

    const policyTarget = await this.getIntroductionPolicyTarget(introduction);
    if (!policyTarget) {
      return;
    }

    const lastUsedAt = introduction.resourceId
      ? await this.getResourceLastUsedAt(introduction.resourceId, introduction.receiverUserId)
      : await this.getGroupLastUsedAt(introduction.resourceGroupId, introduction.receiverUserId);

    const evaluation = this.evaluate(policyTarget.policy, trainedAt, lastUsedAt, now);
    if (!evaluation.applies || !evaluation.isDue) {
      return;
    }

    if (introduction.retrainingNotifiedAt && introduction.retrainingNotifiedAt.getTime() >= trainedAt.getTime()) {
      return;
    }

    if (introduction.receiverUser?.email) {
      await this.emailService.sendUserRetrainingEmail(
        introduction.receiverUser,
        { id: policyTarget.id, name: policyTarget.name, isGroup: policyTarget.isGroup },
        { reason: evaluation.reason, blocksAccess: evaluation.blocksAccess },
      );
    }

    await this.resourceIntroductionRepository.update(introduction.id, { retrainingNotifiedAt: now });
  }

  private async evaluateResourceIntroduction(
    resourceId: number,
    userId: number,
    now: Date,
  ): Promise<RetrainingEvaluation | null> {
    const introduction = await this.resourceIntroductionRepository.findOne({
      where: { resource: { id: resourceId }, receiverUser: { id: userId } },
    });
    if (!introduction || !(await this.isValid(introduction.id))) {
      return null;
    }

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      return null;
    }

    const trainedAt = await this.getTrainedAt(introduction);
    const lastUsedAt = await this.getResourceLastUsedAt(resourceId, userId);
    return this.evaluate(resource, trainedAt, lastUsedAt, now);
  }

  private async evaluateGroupIntroduction(
    groupId: number,
    userId: number,
    now: Date,
  ): Promise<RetrainingEvaluation | null> {
    const introduction = await this.resourceIntroductionRepository.findOne({
      where: { resourceGroup: { id: groupId }, receiverUser: { id: userId } },
    });
    if (!introduction || !(await this.isValid(introduction.id))) {
      return null;
    }

    const group = await this.resourceGroupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      return null;
    }

    const trainedAt = await this.getTrainedAt(introduction);
    const lastUsedAt = await this.getGroupLastUsedAt(groupId, userId);
    return this.evaluate(group, trainedAt, lastUsedAt, now);
  }

  private combine(evaluations: RetrainingEvaluation[]): RetrainingEvaluation {
    const applicable = evaluations.filter((evaluation) => evaluation.applies);
    if (applicable.length === 0) {
      return { ...EMPTY_EVALUATION };
    }

    const hasOpenPath = evaluations.some(
      (evaluation) => !(evaluation.applies && evaluation.isDue && evaluation.blocksAccess),
    );
    const hasFreshApplicable = applicable.some((evaluation) => !evaluation.isDue);
    const isDue = !hasFreshApplicable;

    const soonest = applicable
      .filter((evaluation) => evaluation.dueAt)
      .reduce(
        (a, b) => (a && a.dueAt.getTime() <= b.dueAt.getTime() ? a : b),
        null as RetrainingEvaluation | null,
      );

    return {
      applies: true,
      isDue,
      blocksAccess: !hasOpenPath || (isDue && applicable.some((evaluation) => evaluation.blocksAccess)),
      dueAt: soonest?.dueAt ?? null,
      reason: soonest?.reason ?? null,
    };
  }

  private async getIntroductionPolicyTarget(
    introduction: ResourceIntroduction,
  ): Promise<{ id: number; name: string; isGroup: boolean; policy: RetrainingPolicy } | null> {
    if (introduction.resourceId) {
      const resource = await this.resourceRepository.findOne({ where: { id: introduction.resourceId } });
      return resource ? { id: resource.id, name: resource.name, isGroup: false, policy: resource } : null;
    }

    if (introduction.resourceGroupId) {
      const group = await this.resourceGroupRepository.findOne({ where: { id: introduction.resourceGroupId } });
      return group ? { id: group.id, name: group.name, isGroup: true, policy: group } : null;
    }

    return null;
  }

  private async getTrainedAt(introduction: ResourceIntroduction): Promise<Date | null> {
    const latestGrant = await this.historyRepository.findOne({
      where: { introduction: { id: introduction.id }, action: IntroductionHistoryAction.GRANT },
      order: { createdAt: 'DESC' },
    });
    return latestGrant?.createdAt ?? introduction.completedAt ?? introduction.createdAt ?? null;
  }

  private async isValid(introductionId: number): Promise<boolean> {
    const lastHistoryItem = await this.historyRepository.findOne({
      where: { introduction: { id: introductionId } },
      order: { createdAt: 'DESC' },
    });
    return lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
  }

  private async getResourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null> {
    const lastUsage = await this.resourceUsageRepository.findOne({
      where: { resourceId, userId, endTime: Not(IsNull()) },
      order: { endTime: 'DESC' },
    });
    return lastUsage?.endTime ?? null;
  }

  private async getGroupLastUsedAt(groupId: number, userId: number): Promise<Date | null> {
    const group = await this.resourceGroupRepository.findOne({ where: { id: groupId }, relations: ['resources'] });
    const resourceIds = (group?.resources ?? []).map((resource) => resource.id);
    if (resourceIds.length === 0) {
      return null;
    }

    const lastUsage = await this.resourceUsageRepository.findOne({
      where: { resourceId: In(resourceIds), userId, endTime: Not(IsNull()) },
      order: { endTime: 'DESC' },
    });
    return lastUsage?.endTime ?? null;
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
  }
}
