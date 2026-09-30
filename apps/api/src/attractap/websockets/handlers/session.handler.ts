import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFormAction } from '@attraccess/database-entities';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceFlowsExecutorService } from '../../../resources/flows/resource-flows-executor.service';
import { SumUpService } from '../../../billing/sumup.service';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { FlowExecutionError } from '../../../resources/flows/errors/flow-execution.error';
import { ResourceActionGuard } from './resource-action.guard';
import { ResourceListService } from './resource-list.service';
import { AttractapFormsHandler } from './forms.handler';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class AttractapSessionHandler {
  private readonly logger = new Logger(AttractapSessionHandler.name);

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(ResourceFlowsExecutorService)
  private resourceFlowsExecutorService: ResourceFlowsExecutorService;

  @Inject(SumUpService)
  private sumUpService: SumUpService;

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(AttractapFormsHandler)
  private formsHandler: AttractapFormsHandler;

  @Inject(SupervisionService)
  private supervisionService: SupervisionService;

  public async handleStartResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, projectId, forceTakeOver } = data.payload as {
      resourceId: number;
      projectId?: number;
      forceTakeOver?: boolean;
    };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const formAction = forceTakeOver ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
    const formSubmissions = await this.formsHandler.ensureFormsSatisfied({
      socket,
      resourceId,
      action: formAction,
      requestId: data.payload?.requestId,
    });
    if (formSubmissions === null) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' });
      return;
    }

    // Two-card supervision (ATT-493): if a supervisor card was validated for this socket, attribute
    // the session to that supervisor. The requester stays as `user` (lastAuthenticatedUserId).
    const flow = socket.state.supervisionFlow;
    const supervisorUserId =
      flow && flow.resourceId === resourceId ? (flow.approvedSupervisorUserId ?? undefined) : undefined;

    try {
      await this.resourceUsageService.startSession(
        resourceId,
        user,
        { projectId, formSubmissions, forceTakeOver },
        {
          ...(supervisorUserId ? { supervisorUserId } : {}),
          auditOrigin: { actorId: user.id, authenticationMethod: null },
        },
      );
      this.formsHandler.clearFormDraft(socket, resourceId, formAction);
      // The card channel won — settle the still-open web request so any supervisor popups close.
      if (flow?.requestId) {
        this.supervisionService.settleByCard(flow.requestId);
      }
      socket.state.supervisionFlow = null;
      await this.reply(socket, data, AttractapEventType.START_RESOURCE_USAGE_SESSION, { success: true });
    } catch (error) {
      if (error instanceof ResourceInUseError) {
        // Resolve the pending action before refreshing an occupied row.
        await this.reply(socket, data, AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: error.message });
        await this.resourceListService.sendResourceListToSocket(socket, { resourceIds: new Set([resourceId]) });
        return;
      }
      if (error instanceof InsufficientBalanceError || error?.message === 'INSUFFICIENT_BALANCE') {
        const sumUpEnabled = await this.sumUpService.getIsEnabled();
        await this.reply(socket, data, AttractapEventType.START_RESOURCE_USAGE_SESSION, {
          error: 'INSUFFICIENT_BALANCE',
          sumUpEnabled,
        });
        return;
      }
      this.logger.error(`Failed to start resource usage session: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: error.message });
    }
  }

  public async handleStopResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as {
      resourceId: number;
    };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const formSubmissions = await this.formsHandler.ensureFormsSatisfied({
      socket,
      resourceId,
      action: ResourceFormAction.END,
      requestId: data.payload?.requestId,
    });
    if (formSubmissions === null) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.STOP_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.endSession(
        resourceId,
        user,
        { formSubmissions },
        {
          auditOrigin: { actorId: user.id, authenticationMethod: null },
        },
      );
      this.formsHandler.clearFormDraft(socket, resourceId, ResourceFormAction.END);
      await this.reply(socket, data, AttractapEventType.STOP_RESOURCE_USAGE_SESSION, { success: true });
    } catch (error) {
      this.logger.error(`Failed to stop resource usage session: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.STOP_RESOURCE_USAGE_SESSION, { error: error.message });
    }
  }

  public async handleLockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.LOCK_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.lockDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to lock door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.LOCK_DOOR, { error: errorMessage });
    }
  }

  public async handleUnlockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.UNLOCK_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.unlockDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlock door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.UNLOCK_DOOR, { error: errorMessage });
    }
  }

  public async handleUnlatchDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.UNLATCH_DOOR,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { error: 'USER_NOT_FOUND' });
      return;
    }

    try {
      await this.resourceUsageService.unlatchDoor(resourceId, user);
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { success: true });
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlatch door: ${errorMessage}`);
      await this.reply(socket, data, AttractapEventType.UNLATCH_DOOR, { error: errorMessage });
    }
  }

  public async handleTriggerFlowButton(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, buttonId } = data.payload as { resourceId: number; buttonId: string };

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.TRIGGER_FLOW_BUTTON,
        data.payload?.requestId,
      ))
    ) {
      return;
    }

    try {
      await this.resourceFlowsExecutorService.pressButton(resourceId, buttonId, socket.state.lastAuthenticatedUserId);
      await this.reply(socket, data, AttractapEventType.TRIGGER_FLOW_BUTTON, { success: true });
    } catch (error) {
      this.logger.error(`Failed to trigger flow button: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.TRIGGER_FLOW_BUTTON, { error: error.message });
    }
  }

  private reply(
    socket: AuthenticatedWebSocket,
    request: AttractapEvent['data'],
    type: AttractapEventType,
    payload: Record<string, unknown>,
  ) {
    const requestId = request.payload?.requestId;
    return socket.sendMessage(
      new AttractapEvent(type, {
        ...payload,
        ...(Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {}),
      }),
    );
  }

  private extractUserFacingError(error: unknown): string {
    if (error instanceof FlowExecutionError) {
      return error.message.replace(/^FLOW_EXECUTION_ERROR:\s*/, '');
    }
    return error instanceof Error ? error.message : String(error);
  }
}
