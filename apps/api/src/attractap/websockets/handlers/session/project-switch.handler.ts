import { ResourceFormAction } from '@attraccess/application-models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InsufficientBalanceError } from '../../../../billing/errors/insufficient-balance.error';
import { NoSessionToSwitchError } from '../../../../resources/usage/errors/no-session-to-switch.error';
import { SumUpService } from '../../../../billing/sumup/sumup.service';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { UsersService } from '../../../../users-and-auth/users/users.service';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { ResourceActionGuard } from '../resource-action.guard';
import { ResourceListService } from '../resource-list/resource-list.service';
import { CardSessionService } from '../ui/card-session.service';

/**
 * Refusals answered with their code alone; the rest of the server's message is not for the screen. The reader has a
 * text for METER_SWITCH_FAILED. Its firmware has none for FLOW_EXECUTION_ERROR and shows its general failure there.
 */
const CODED_REFUSAL = /^(METER_SWITCH_FAILED|FLOW_EXECUTION_ERROR)\b/;

/** `capabilities.projectSwitch` readers: the card holder moves their running session to another project. */
@Injectable()
export class AttractapProjectSwitchHandler {
  private readonly logger = new Logger(AttractapProjectSwitchHandler.name);

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(SumUpService)
  private sumUpService: SumUpService;

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(AttractapFormsHandler)
  private formsHandler: AttractapFormsHandler;

  @Inject(CardSessionService)
  private cardSessions: CardSessionService;

  public async handleSwitchSessionProject(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    // The reader may end its login (READER_SESSION_ENDED) while this runs: act for the user who asked.
    const userId = socket.state.verifiedUserId;
    const { resourceId, usageId, projectId, cardSessionId } = (data.payload ?? {}) as {
      resourceId: number;
      /** The running session shown on the reader. */
      usageId?: number;
      /** Null books the rest of the session to no project. */
      projectId: number | null;
      cardSessionId?: string;
    };
    const type = AttractapEventType.SWITCH_SESSION_PROJECT;
    const requestId = data.payload?.requestId;
    const reply = (payload: Record<string, unknown>) =>
      socket.sendMessage(
        new AttractapEvent(type, {
          ...payload,
          ...(Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {}),
        }),
      );
    // The reader is still signed in: keep its card session alive, as a start or stop does.
    this.cardSessions.resume(socket, cardSessionId, userId);

    // Only readers that announced the capability are offered the action, so only they may ask for it.
    if (socket.state.projectSwitch !== true) {
      await reply({ error: 'PROJECT_SWITCH_NOT_SUPPORTED' });
      return;
    }
    if (!(await this.resourceActionGuard.validateResourceAction(socket, resourceId, type, requestId))) return;
    if (projectId !== null && !(Number.isSafeInteger(projectId) && projectId > 0)) {
      await reply({ error: 'INVALID_PROJECT_ID' });
      return;
    }

    const user = userId == null ? null : await this.usersService.findOne({ id: userId });
    if (!user) {
      await reply({ error: 'USER_NOT_FOUND' });
      return;
    }

    const target = { projectId, ...(Number.isInteger(usageId) ? { usageId } : {}) };
    const refuse = async (error: unknown) => {
      await this.replyRefusal(resourceId, user.id, reply, error);
      // The refreshed row shows what still runs, and under which project.
      await this.resourceListService.sendResourceListToSocket(socket, { resourceIds: new Set([resourceId]) });
    };
    try {
      // Before the forms: nobody should fill them in for a switch that cannot happen.
      await this.resourceUsageService.assertSessionProjectSwitchable(resourceId, user, target);
    } catch (error) {
      await refuse(error);
      return;
    }

    const action = ResourceFormAction.PROJECT_SWITCH;
    const formSubmissions = await this.formsHandler.ensureFormsSatisfied({
      socket,
      resourceId,
      action,
      requestId,
      reject: reply,
    });
    if (formSubmissions === null) return;

    try {
      const releaseCardSession = this.cardSessions.hold(socket);
      const switched = await this.resourceUsageService
        .switchSessionProject(
          resourceId,
          user,
          { ...target, formSubmissions },
          { auditOrigin: { id: user.id, authenticationMethod: null } },
        )
        .finally(releaseCardSession);
      this.formsHandler.clearFormDraft(socket, resourceId, action);
      await reply({ success: true, usageId: switched.id, projectName: switched.project?.name ?? null });
    } catch (error) {
      await refuse(error);
    }
  }

  /**
   * A named session that is gone may still run, as the record a switch made elsewhere continued it with. Then the
   * reader must not say that nothing of theirs runs here: it has no text for this code and shows its general failure.
   */
  private async goneSessionCode(resourceId: number, userId: number): Promise<string> {
    const active = await this.resourceUsageService.getActiveSessionsForResource(resourceId);
    return active.some((session) => session.userId === userId)
      ? 'PROJECT_SWITCH_SESSION_CHANGED'
      : // The code of a stop without an own session: the reader says that none of theirs runs here.
        'NoOwnActiveSessionError';
  }

  private async replyRefusal(
    resourceId: number,
    userId: number,
    reply: (payload: Record<string, unknown>) => Promise<unknown>,
    error: unknown,
  ): Promise<void> {
    if (error instanceof InsufficientBalanceError) {
      await reply({ error: 'INSUFFICIENT_BALANCE', sumUpEnabled: await this.sumUpService.getIsEnabled() });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Switching the project of a session on resource ${resourceId} failed: ${message}`);
    if (error instanceof NoSessionToSwitchError) await reply({ error: await this.goneSessionCode(resourceId, userId) });
    else await reply({ error: CODED_REFUSAL.exec(message)?.[1] ?? message });
  }
}
