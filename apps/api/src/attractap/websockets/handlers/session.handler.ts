import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFormAction } from '@attraccess/database-entities';
import { ResourceMeteringService } from '../../../resources/metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../../../resources/operating-intervals/resource-operating-attribution.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceFlowsExecutorService } from '../../../resources/flows/resource-flows-executor.service';
import { SumUpService } from '../../../billing/sumup.service';
import { BillingService } from '../../../billing/billing.service';
import { dbCurrencyToUserCurrency, formatCredits } from '@attraccess/shared';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { FlowExecutionError } from '../../../resources/flows/errors/flow-execution.error';
import { ResourceActionGuard } from './resource-action.guard';
import { ResourceListService } from './resource-list.service';
import { AttractapFormsHandler } from './forms.handler';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import {
  AuthenticatedWebSocket,
  AttractapEvent,
  AttractapEventType,
  ResourceUsageStatsPayload,
} from '../websocket.types';

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

  @Inject(BillingService)
  private billingService: BillingService;

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(AttractapFormsHandler)
  private formsHandler: AttractapFormsHandler;

  @Inject(SupervisionService)
  private supervisionService: SupervisionService;

  @Inject(ResourceMeteringService)
  private meteringService: ResourceMeteringService;

  @Inject(ResourceOperatingAttributionService)
  private operatingAttributionService: ResourceOperatingAttributionService;

  public async handleResourceUsageStats(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload ?? {};
    const userId = socket.state.lastAuthenticatedUserId;
    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.RESOURCE_USAGE_STATS,
        data.payload?.requestId,
      ))
    )
      return;

    try {
      const usage = await this.resourceUsageService.getActiveSession(resourceId);
      // Live session readings belong to the current user, just like the active-session web UI.
      if (!usage || usage.userId !== userId) {
        await this.reply(socket, data, AttractapEventType.RESOURCE_USAGE_STATS, { resourceId, usage: null });
        return;
      }
      const asOf = new Date();
      const [meter, operating, billingConfiguration] = await Promise.all([
        this.meteringService.getLive(resourceId),
        this.operatingAttributionService.getForResource(resourceId, asOf, usage.startTime),
        this.billingService.getConfiguration(),
      ]);
      if (socket.state.lastAuthenticatedUserId !== userId) return;
      await this.reply(socket, data, AttractapEventType.RESOURCE_USAGE_STATS, {
        resourceId,
        usage: {
          id: usage.id,
          operatingDurationMs: operating.operatingDataAvailable
            ? operating.attributions.reduce(
                (total, entry) => total + (entry.usageId === usage.id ? entry.durationMs : 0),
                0,
              )
            : null,
          isOperating: operating.operatingDataAvailable ? operating.isOperating : null,
          // Catalog entries include captured terms with unavailable values for skipped free meters.
          // Never attach a new session's meter reading to an earlier usage snapshot.
          meters: meter.meters
            .filter((entry) => entry.session?.usageId === usage.id)
            .map((entry) => ({
              id: entry.id,
              name: entry.session.meterName,
              creditsPerUnit: entry.session.creditsPerUnit,
              formattedRate: this.formatMeterRate(entry.session.creditsPerUnit, billingConfiguration),
              value: entry.session.latestValue,
            })),
        },
      } satisfies ResourceUsageStatsPayload);
    } catch (error) {
      this.logger.warn(`Failed to load live usage stats: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.RESOURCE_USAGE_STATS, { resourceId, usage: null });
    }
  }

  private formatMeterRate(creditsPerUnit: number, configuration: { minorUnit: number; currency: string }): string {
    return `${formatCredits(creditsPerUnit, configuration.minorUnit, {
      locale: 'de-DE',
      minimumFractionDigits: configuration.minorUnit,
    })} ${configuration.currency}`;
  }

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
      const usage = await this.resourceUsageService.endSession(
        resourceId,
        user,
        { formSubmissions },
        {
          auditOrigin: { actorId: user.id, authenticationMethod: null },
        },
      );
      this.formsHandler.clearFormDraft(socket, resourceId, ResourceFormAction.END);
      // Billing lookup failures must not turn an already-ended session into a failed action.
      let billingSummary: { amount: number; total: string } | undefined;
      try {
        if (usage?.userId === user.id) {
          const charge = await this.billingService.getResourceUsageCharge(usage.id, user.id);
          if (charge && charge.amount !== 0) {
            const configuration = await this.billingService.getConfiguration();
            const amount = -charge.amount;
            const total = new Intl.NumberFormat('de-DE', {
              minimumFractionDigits: configuration.minorUnit,
              maximumFractionDigits: configuration.minorUnit,
            }).format(dbCurrencyToUserCurrency(amount, configuration.minorUnit));
            billingSummary = { amount, total: `${total} ${configuration.currency}` };
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to load session billing summary: ${error.message}`);
      }
      await this.reply(socket, data, AttractapEventType.STOP_RESOURCE_USAGE_SESSION, {
        success: true,
        ...(billingSummary ? { billingSummary } : {}),
      });
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
