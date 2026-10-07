import { IntroductionHistoryAction, ResourceIntroduction } from '@attraccess/database-entities';
import { In, IsNull, Not } from 'typeorm';
import { ResourceRetrainingNotificationImplementation } from './resource-retraining-notification';
import {
  DAY_MS,
  EMPTY_EVALUATION,
  RetrainingEvaluation,
  RetrainingPolicy,
} from './resourceRetraining.service.feature-definitions';
export abstract class ResourceRetrainingPolicyImplementation extends ResourceRetrainingNotificationImplementation {
  public async getIntroductionRetrainingStatus(introductionId: number): Promise<RetrainingEvaluation | null> {
    const introduction = await this.resourceIntroductionRepository.findOne({ where: { id: introductionId } });
    if (!introduction || !(await this.isValid(introduction.id))) return null;
    const trainedAt = await this.getTrainedAt(introduction);
    if (!trainedAt) return null;
    const target = await this.getIntroductionPolicyTarget(introduction);
    if (!target) return null;
    const lastUsedAt = introduction.resourceId
      ? await this.getResourceLastUsedAt(introduction.resourceId, introduction.receiverUserId)
      : await this.getGroupLastUsedAt(introduction.resourceGroupId, introduction.receiverUserId);
    return this.evaluate(target.policy, trainedAt, lastUsedAt);
  }

  protected async evaluateResourceIntroduction(
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

  protected async evaluateGroupIntroduction(
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

  protected combine(evaluations: RetrainingEvaluation[]): RetrainingEvaluation {
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
      .reduce((a, b) => (a && a.dueAt.getTime() <= b.dueAt.getTime() ? a : b), null as RetrainingEvaluation | null);

    return {
      applies: true,
      isDue,
      blocksAccess: !hasOpenPath || (isDue && applicable.some((evaluation) => evaluation.blocksAccess)),
      dueAt: soonest?.dueAt ?? null,
      reason: soonest?.reason ?? null,
    };
  }

  protected async getIntroductionPolicyTarget(
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

  protected async getTrainedAt(introduction: ResourceIntroduction): Promise<Date | null> {
    const latestGrant = await this.historyRepository.findOne({
      where: { introduction: { id: introduction.id }, action: IntroductionHistoryAction.GRANT },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return latestGrant?.createdAt ?? introduction.completedAt ?? introduction.createdAt ?? null;
  }

  protected async isValid(introductionId: number): Promise<boolean> {
    const lastHistoryItem = await this.historyRepository.findOne({
      where: { introduction: { id: introductionId } },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
  }

  protected async getResourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null> {
    const lastUsage = await this.resourceUsageRepository.findOne({
      where: { resourceId, userId, endTime: Not(IsNull()) },
      order: { endTime: 'DESC' },
    });
    return lastUsage?.endTime ?? null;
  }

  protected async getGroupLastUsedAt(groupId: number, userId: number): Promise<Date | null> {
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

  protected addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
  }
}
