import { ResourceIntroduction } from '@attraccess/database-entities';
import { Cron } from '@nestjs/schedule';
import { ResourceRetrainingServiceRouteContext } from './resourceRetraining.service.route-context';
export abstract class ResourceRetrainingNotificationImplementation extends ResourceRetrainingServiceRouteContext {
  @Cron('0 3 * * *')
  public async evaluateAndNotify(): Promise<void> {
    const now = new Date();
    const introductions = await this.resourceIntroductionRepository
      .createQueryBuilder('introduction')
      .leftJoinAndSelect('introduction.receiverUser', 'receiverUser')
      .leftJoin('introduction.resource', 'resource')
      .leftJoin('introduction.resourceGroup', 'resourceGroup')
      .where('resource.retrainingMaxAgeDays IS NOT NULL')
      .orWhere('resource.retrainingMaxInactivityDays IS NOT NULL')
      .orWhere('resourceGroup.retrainingMaxAgeDays IS NOT NULL')
      .orWhere('resourceGroup.retrainingMaxInactivityDays IS NOT NULL')
      .getMany();

    for (const introduction of introductions) {
      try {
        await this.notifyIfDue(introduction, now);
      } catch (error) {
        this.logger.error(`Failed to evaluate retraining for introduction ${introduction.id}`, (error as Error).stack);
      }
    }
  }

  protected async notifyIfDue(introduction: ResourceIntroduction, now: Date): Promise<void> {
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
      const recorded = await this.audit.recordResource({
        action: 'retraining.required',
        actorId: null,
        subjectId,
        ...(introduction.resourceId ? {} : { subjectType: 'resource_group' }),
        details: {
          introductionId: introduction.id,
          usageUserId: introduction.receiverUserId,
          retrainingReason: evaluation.reason ?? 'unknown',
        },
      });
      if (recorded) {
        await this.resourceIntroductionRepository.update(introduction.id, { retrainingRequiredAuditedAt: now });
      }
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
    // A failed delivery must remain eligible for the next scheduled retry.
    await this.resourceIntroductionRepository.update(introduction.id, { retrainingNotifiedAt: now });
  }
}
