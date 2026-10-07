import {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { RetrainingEvaluation, RetrainingPolicy } from './resourceRetraining.service.feature-definitions';

export abstract class ResourceRetrainingServiceRouteContext {
  protected abstract readonly resourceIntroductionRepository: Repository<ResourceIntroduction>;
  protected abstract notifyIfDue(introduction: ResourceIntroduction, now: Date): Promise<void>;
  protected abstract readonly logger: Logger;
  protected abstract isValid(introductionId: number): Promise<boolean>;
  protected abstract getTrainedAt(introduction: ResourceIntroduction): Promise<Date | null>;
  protected abstract getIntroductionPolicyTarget(
    introduction: ResourceIntroduction,
  ): Promise<{ id: number; name: string; isGroup: boolean; policy: RetrainingPolicy } | null>;
  protected abstract getResourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null>;
  protected abstract getGroupLastUsedAt(groupId: number, userId: number): Promise<Date | null>;
  public abstract evaluate(
    policy: RetrainingPolicy,
    trainedAt: Date,
    lastUsedAt: Date | null,
    now?: Date,
  ): RetrainingEvaluation;
  protected abstract readonly audit: AuditService;
  protected abstract readonly emailService: EmailService;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly resourceGroupRepository: Repository<ResourceGroup>;
  protected abstract readonly historyRepository: Repository<ResourceIntroductionHistoryItem>;
  protected abstract readonly resourceUsageRepository: Repository<ResourceUsage>;
}
