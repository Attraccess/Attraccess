import { ResourceMeter } from '@attraccess/database-entities';
import {
  FormSubmission,
  ResourceFormAction,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { UsageResourceGatesImplementation } from './usage-resource-gates';
export abstract class UsageStartPreparationImplementation extends UsageResourceGatesImplementation {
  protected async prepareSessionStart(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
  ) {
    return runSerializedTransaction(this.resourceUsageRepository.manager, async (transactionalEntityManager) => {
      await this.assertLifecycleAvailable(transactionalEntityManager, resourceId);
      // Maintenance/health are enforced here; the control gate is applied below so the supervised
      // path can bypass the introduction requirement when a qualified supervisor is present.
      const resource = await this.getResource(
        resourceId,
        user,
        {
          checkMaintenance: true,
          checkControlPermission: false,
        },
        transactionalEntityManager,
      );

      // Gate: the solo path stays identical to today's behavior. Only when the user cannot start
      // solo (or the resource mandates supervision) does the supervised path apply.
      if (supervisorUserId === null) {
        const userCanControl = await this.canControllResource(resourceId, user, transactionalEntityManager);
        if (!userCanControl) {
          this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
          throw new BadRequestException('You must complete the resource introduction before using it');
        }
        if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
          throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
        }
      } else {
        await this.validateSupervisedStart(resourceId, user, supervisorUserId, transactionalEntityManager, resource);
      }

      if (resource.type !== ResourceType.Machine) {
        throw new BadRequestException('Resource is not a machine');
      }

      const existingActiveSession = await this.getActiveSession(resourceId, transactionalEntityManager);
      if (existingActiveSession) {
        this.logger.debug(
          `Found existing active session for resource ${resourceId} by user ${existingActiveSession.user.id}`,
        );

        // If there's an active session, check if takeover is allowed
        if (dto.forceTakeOver && resource.allowTakeOver) {
          this.logger.debug(
            `Forcing takeover of resource ${resourceId} from user ${existingActiveSession.user.id} to user ${user.id}`,
          );

          // The outgoing user is retained after this transaction succeeds.
        } else if (dto.forceTakeOver && !resource.allowTakeOver) {
          this.logger.warn(`Takeover attempted for resource ${resourceId} but not allowed`);
          throw new BadRequestException('This resource does not allow overtaking');
        } else {
          this.logger.warn(`Resource ${resourceId} is currently in use by user ${existingActiveSession.user.id}`);
          throw new ResourceInUseError();
        }
      }

      const usageData: Partial<ResourceUsage> = {
        resourceId,
        usageAction: ResourceUsageAction.Usage,
        userId: user.id,
        startTime: new Date(),
        startNotes: dto.notes,
        endTime: null,
        endNotes: null,
        isFinalized: false,
        lifecyclePending: true,
      };

      const billingConfiguration = await this.billingService.getResourceBillingConfiguration(
        resourceId,
        transactionalEntityManager,
      );
      usageData.sessionDurationCreditsPerMinute = billingConfiguration.creditsPerMinute;
      usageData.operatingDurationCreditsPerMinute = billingConfiguration.creditsPerOperatingMinute;
      usageData.creditsPerUsage = billingConfiguration.creditsPerUsage;
      usageData.meterRates = this.metering
        ? (await transactionalEntityManager.find(ResourceMeter, { where: { resourceId } })).map((meter) => ({
            meterId: meter.id,
            name: meter.name,
            creditsPerUnit: meter.creditsPerUnit,
          }))
        : [];

      if (supervisorUserId !== null) {
        usageData.supervisorUserId = supervisorUserId;
      }

      if (dto.projectId !== undefined) {
        const project = await this.projectsService.findOneById(user.id, dto.projectId);

        usageData.projectId = project.id;
      }

      this.logger.debug(`Creating new usage session for resource ${resourceId}`, { usageData });

      await transactionalEntityManager.createQueryBuilder().insert().into(ResourceUsage).values(usageData).execute();

      const createdSession = await transactionalEntityManager.findOne(ResourceUsage, {
        where: {
          resourceId,
          userId: user.id,
          endTime: IsNull(),
          lifecyclePending: true,
        },
        order: {
          startTime: 'DESC',
        },
        relations: ['resource', 'user', 'project'],
      });

      if (!createdSession) {
        this.logger.error(`Failed to retrieve newly created session for resource ${resourceId} and user ${user.id}`);
        throw new Error('Failed to retrieve the newly created session.');
      }

      // Use the user read inside this transaction, not the potentially stale authentication object.
      createdSession.billingFactor = createdSession.user.billingFactor;
      await transactionalEntityManager.update(ResourceUsage, createdSession.id, {
        billingFactor: createdSession.billingFactor,
      });

      this.logger.debug(
        `Successfully created session ${createdSession.id} for resource ${resourceId} by user ${user.id}`,
      );

      let formSubmissions: FormSubmission[] = [];
      if (resource.type === ResourceType.Machine) {
        const action = dto.forceTakeOver ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
        formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
          resourceId,
          action,
          submissions: dto.formSubmissions,
          userId: user.id,
          resourceUsageId: createdSession.id,
          manager: transactionalEntityManager,
        });
      }

      await this.billingService.validateResourceUsageStart(
        resourceId,
        createdSession,
        user,
        transactionalEntityManager,
      );
      const attempt = await transactionalEntityManager.save(ResourceUsageLifecycleAttempt, {
        id: attemptId,
        resourceId,
        kind: existingActiveSession ? 'takeover' : 'start',
        candidateUsageId: createdSession.id,
        previousUsageId: existingActiveSession?.id ?? null,
        transitionTime: createdSession.startTime,
        formSubmissions,
        billingItems: [],
      });
      return { resource, createdSession, existingActiveSession, attempt, formSubmissions };
    });
  }
}
