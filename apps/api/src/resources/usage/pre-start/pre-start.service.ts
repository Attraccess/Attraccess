import { Injectable, Logger } from '@nestjs/common';
import { type User } from '@attraccess/database-entities';
import type { PreStartOrigin } from '@attraccess/plugins-backend-sdk';
import { ReaderUiHooksService, type PreStartOutcome } from '../../../plugin-system/reader-ui/reader-ui-hooks.service';
import { ResourceUsageService } from '../sessions/resource-usage.service';
import { StartBlockedException, StartConfirmationRequiredException } from './start-confirmation.errors';
import { WebStartStepStore } from './web-start-step.store';
import type { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

export interface PreStartInput {
  resourceId: number;
  user: User;
  forceTakeOver?: boolean;
  projectId?: number;
  origin: PreStartOrigin;
  supervisorUserId?: number | null;
  readerId?: number;
  cardSessionId?: string;
  /** plugin -> step keys already confirmed in this start attempt. */
  satisfied?: Record<string, string[]>;
}

/**
 * The one pre-start gate for reader, web, API and supervision starts (ATT-1187). It runs the read-only
 * can-start precheck first, so a user who would be refused anyway never sees a plugin question, then the hooks.
 * Stop and emergency stop never come through here.
 */
@Injectable()
export class PreStartService {
  private readonly logger = new Logger(PreStartService.name);

  constructor(
    private readonly usage: ResourceUsageService,
    private readonly hooks: ReaderUiHooksService,
    private readonly webSteps: WebStartStepStore,
  ) {}

  hasHooks(): boolean {
    return this.hooks.hasPreStartHooks();
  }

  async evaluate(input: PreStartInput): Promise<PreStartOutcome> {
    if (!this.hooks.hasPreStartHooks()) return { decision: 'allow' };
    try {
      await this.usage.precheckStart(input.resourceId, input.user, input, input.supervisorUserId ?? null);
    } catch (error) {
      // The real start raises the same refusal with the normal error handling.
      this.logger.debug(`Pre-start hooks skipped, precheck refused: ${(error as Error).message}`);
      return { decision: 'allow' };
    }
    return this.hooks.runPreStart({
      resourceId: input.resourceId,
      userId: input.user.id,
      action: input.forceTakeOver ? 'takeover' : 'start',
      projectId: input.projectId,
      origin: input.origin,
      readerId: input.readerId,
      cardSessionId: input.cardSessionId,
      satisfied: new Map(Object.entries(input.satisfied ?? {}).map(([plugin, keys]) => [plugin, new Set(keys)])),
    });
  }

  /** Web and API starts: throws the typed 409 / 403, otherwise lets the start continue. */
  async gateHttp(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    principal: { origin: 'web' | 'api'; apiTokenId?: number },
  ): Promise<void> {
    const action = dto.forceTakeOver ? 'takeover' : 'start';
    const binding = {
      userId: user.id,
      apiTokenId: principal.apiTokenId,
      resourceId,
      action,
      projectId: dto.projectId,
      origin: principal.origin,
    } as const;
    // Ids are consumed even when no hook is registered (anymore): they are single-use either way.
    const satisfied = this.webSteps.consume(dto.confirmedStepIds, binding);
    const outcome = await this.evaluate({
      resourceId,
      user,
      forceTakeOver: dto.forceTakeOver,
      projectId: dto.projectId,
      origin: principal.origin,
      satisfied,
    });
    if (outcome.decision === 'block') throw new StartBlockedException(outcome.reason);
    if (outcome.decision === 'confirm') {
      const c = outcome.confirmation;
      const { stepId, expiresAtMs } = this.webSteps.issue(
        binding,
        outcome.plugin,
        c.stepKey,
        c.expiresInSec ?? 60,
        satisfied,
      );
      throw new StartConfirmationRequiredException(stepId, {
        title: c.title,
        body: c.body,
        ...(c.tone ? { tone: c.tone } : {}),
        ...(c.confirmLabel ? { confirmLabel: c.confirmLabel } : {}),
        ...(c.cancelLabel ? { cancelLabel: c.cancelLabel } : {}),
        ...(c.countdownTo ? { countdownToMs: new Date(c.countdownTo).getTime() } : {}),
        expiresAtMs,
      });
    }
  }

  /**
   * Supervision approval starts the session for the requester. A `confirm` cannot be asked of anybody there,
   * so it blocks with the plugin's text (documented default); the requester's earlier confirmation is not carried.
   */
  async gateSupervision(resourceId: number, requester: User, dto: StartUsageSessionDto, supervisorUserId: number) {
    const outcome = await this.evaluate({
      resourceId,
      user: requester,
      forceTakeOver: dto.forceTakeOver,
      projectId: dto.projectId,
      origin: 'supervision',
      supervisorUserId,
    });
    if (outcome.decision === 'block') throw new StartBlockedException(outcome.reason);
    if (outcome.decision === 'confirm') {
      throw new StartBlockedException({
        code: 'CONFIRMATION_REQUIRED',
        title: outcome.confirmation.title,
        body: outcome.confirmation.body,
      });
    }
  }
}
