import { IntroductionHistoryAction, type IntroductionRecord } from '@attraccess/application-models';

import { Injectable, Logger, Inject } from '@nestjs/common';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { EmailService } from '../../email/email.service';

import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { Cron } from '@nestjs/schedule';
import {
  RESOURCE_INTRODUCTION_STORE,
  type ResourceIntroductionStore,
} from '../introductions/resource-introduction-store.port';
import { RESOURCE_RETRAINING_STORE, type RetrainingStore } from './retraining-store.port';
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

export const DAY_MS = 24 * 60 * 60 * 1000;

export const EMPTY_EVALUATION: RetrainingEvaluation = {
  applies: false,
  isDue: false,
  blocksAccess: false,
  dueAt: null,
  reason: null,
};

@Injectable()
export class ResourceRetrainingService {
  constructor(
    @Inject(RESOURCE_RETRAINING_STORE)
    protected readonly retrainingStore: RetrainingStore,
    @Inject(RESOURCE_INTRODUCTION_STORE)
    protected readonly introductionStore: ResourceIntroductionStore,
    protected readonly resourceGroupsService: ResourceGroupsService,
    protected readonly emailService: EmailService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(ResourceRetrainingService.name);

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

  public async getIntroductionRetrainingStatus(introductionId: number): Promise<RetrainingEvaluation | null> {
    const introduction = await this.introductionStore.findById(introductionId);
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
    const introduction = await this.introductionStore.findOfUser(resourceId, userId);
    if (!introduction || !(await this.isValid(introduction.id))) {
      return null;
    }

    const resource = await this.retrainingStore.findResourceTarget(resourceId);
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
    const introduction = await this.introductionStore.findOfGroupUser(groupId, userId);
    if (!introduction || !(await this.isValid(introduction.id))) {
      return null;
    }

    const group = await this.retrainingStore.findGroupTarget(groupId);
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
    introduction: IntroductionRecord,
  ): Promise<{ id: number; name: string; isGroup: boolean; policy: RetrainingPolicy } | null> {
    if (introduction.resourceId) {
      const resource = await this.retrainingStore.findResourceTarget(introduction.resourceId);
      return resource ? { id: resource.id, name: resource.name, isGroup: false, policy: resource } : null;
    }

    if (introduction.resourceGroupId) {
      const group = await this.retrainingStore.findGroupTarget(introduction.resourceGroupId);
      return group ? { id: group.id, name: group.name, isGroup: true, policy: group } : null;
    }

    return null;
  }

  protected async getTrainedAt(introduction: IntroductionRecord): Promise<Date | null> {
    const latestGrant = await this.introductionStore.latestGrant(introduction.id);
    return latestGrant?.createdAt ?? introduction.completedAt ?? introduction.createdAt ?? null;
  }

  protected async isValid(introductionId: number): Promise<boolean> {
    const lastHistoryItem = await this.introductionStore.lastHistoryItem(introductionId);
    return lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
  }

  protected async getResourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null> {
    return this.retrainingStore.lastResourceUseAt(resourceId, userId);
  }

  protected async getGroupLastUsedAt(groupId: number, userId: number): Promise<Date | null> {
    return this.retrainingStore.lastGroupUseAt(groupId, userId);
  }

  protected addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
  }

  @Cron('0 3 * * *')
  public async evaluateAndNotify(): Promise<void> {
    const now = new Date();
    const introductions = await this.introductionStore.listWithRetrainingRule();

    for (const introduction of introductions) {
      try {
        await this.notifyIfDue(introduction, now);
      } catch (error) {
        this.logger.error(`Failed to evaluate retraining for introduction ${introduction.id}`, (error as Error).stack);
      }
    }
  }

  protected async notifyIfDue(introduction: IntroductionRecord, now: Date): Promise<void> {
    if (!(await this.isValid(introduction.id))) {
      return;
    }
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

    // This marker survives audit retention but is reset by a newer training cycle.
    if (!introduction.retrainingRequiredAuditedAt || introduction.retrainingRequiredAuditedAt < trainedAt) {
      const subjectId = introduction.resourceId ?? introduction.resourceGroupId;
      const receipt = await this.audit.record({
        domain: 'resource',
        action: 'retraining.required',
        actor: { id: null, authenticationMethod: null },
        subject: { type: introduction.resourceId ? 'resource' : 'resource_group', id: subjectId },
        details: {
          introductionId: introduction.id,
          usageUserId: introduction.receiverUserId,
          retrainingReason: evaluation.reason ?? 'unknown',
        },
      });
      // A dropped row (audit off, queue full, storage error) is retried on the next evaluation.
      if (receipt.status === 'recorded') {
        await this.introductionStore.markRetrainingRequiredAudited(introduction.id, now);
      }
    }
    if (introduction.retrainingNotifiedAt && introduction.retrainingNotifiedAt.getTime() >= trainedAt.getTime()) {
      return;
    }
    if (introduction.receiver?.email) {
      await this.emailService.sendUserRetrainingEmail(
        introduction.receiver as unknown as Parameters<EmailService['sendUserRetrainingEmail']>[0],
        { id: policyTarget.id, name: policyTarget.name, isGroup: policyTarget.isGroup },
        { reason: evaluation.reason, blocksAccess: evaluation.blocksAccess },
      );
    }
    // A failed delivery must remain eligible for the next scheduled retry.
    await this.introductionStore.markRetrainingNotified(introduction.id, now);
  }
}
