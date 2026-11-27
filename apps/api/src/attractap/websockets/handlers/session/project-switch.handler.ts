import { ResourceFormAction } from '@attraccess/application-models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InsufficientBalanceError } from '../../../../billing/errors/insufficient-balance.error';
import { SumUpService } from '../../../../billing/sumup/sumup.service';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { UsersService } from '../../../../users-and-auth/users/users.service';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapFormsHandler } from '../forms/forms.handler';
import { ResourceActionGuard } from '../resource-action.guard';
import { ResourceListService } from '../resource-list/resource-list.service';
import { CardSessionService } from '../ui/card-session.service';

/** Refusals the reader has a text for, as the prefix of the server's message. */
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

    const action = ResourceFormAction.PROJECT_SWITCH;
    const formSubmissions = await this.formsHandler.ensureFormsSatisfied({
      socket,
      resourceId,
      action,
      requestId,
      reject: reply,
    });
    if (formSubmissions === null) return;

    const user = userId == null ? null : await this.usersService.findOne({ id: userId });
    if (!user) {
      await reply({ error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      const releaseCardSession = this.cardSessions.hold(socket);
      const switched = await this.resourceUsageService
        .switchSessionProject(
          resourceId,
          user,
          { projectId, formSubmissions, ...(Number.isInteger(usageId) ? { usageId } : {}) },
          { auditOrigin: { id: user.id, authenticationMethod: null } },
        )
        .finally(releaseCardSession);
      this.formsHandler.clearFormDraft(socket, resourceId, action);
      await reply({ success: true, usageId: switched.id, projectName: switched.project?.name ?? null });
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        await reply({ error: 'INSUFFICIENT_BALANCE', sumUpEnabled: await this.sumUpService.getIsEnabled() });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Switching the project of a session on resource ${resourceId} failed: ${message}`);
        await reply({ error: CODED_REFUSAL.exec(message)?.[1] ?? message });
      }
      // The refreshed row shows what still runs, and under which project.
      await this.resourceListService.sendResourceListToSocket(socket, { resourceIds: new Set([resourceId]) });
    }
  }
}
