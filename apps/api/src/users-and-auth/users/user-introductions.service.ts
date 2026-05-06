// Aggregates a single user's resource + group introductions, returns only WARNING/EXPIRED
// FEATURE: User retraining requirement (ATT-106)
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceIntroduction } from '@attraccess/database-entities';
import { IntroductionScheduleEvaluatorService } from '../../resources/introductions/schedules/introduction-schedule-evaluator.service';
import { ExpiringIntroductionDto } from '../../resources/introductions/dtos/expiringIntroduction.response.dto';
import { IntroductionStatus } from '../../resources/introductions/dtos/introductionStatus.response.dto';

@Injectable()
export class UserIntroductionsService {
  constructor(
    @InjectRepository(ResourceIntroduction)
    private readonly introRepo: Repository<ResourceIntroduction>,
    private readonly evaluator: IntroductionScheduleEvaluatorService,
  ) {}

  async findMyExpiring(userId: number): Promise<ExpiringIntroductionDto[]> {
    const intros = await this.introRepo.find({
      where: { receiverUserId: userId },
      relations: ['resource', 'resourceGroup'],
    });
    const out: ExpiringIntroductionDto[] = [];
    for (const intro of intros) {
      const evalResult = await this.evaluator.evaluateIntroduction(intro);
      if (evalResult.status === 'ACTIVE') continue;
      const status =
        evalResult.status === 'EXPIRED' ? IntroductionStatus.EXPIRED : IntroductionStatus.WARNING;
      out.push({
        kind: intro.resourceId != null ? 'resource' : 'resourceGroup',
        resourceId: intro.resourceId ?? undefined,
        resourceGroupId: intro.resourceGroupId ?? undefined,
        name: intro.resource?.name ?? intro.resourceGroup?.name ?? '',
        status,
        dueAt: evalResult.expiresAt ? evalResult.expiresAt.toISOString() : null,
      });
    }
    return out;
  }
}
