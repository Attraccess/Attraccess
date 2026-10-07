import { ResourceFormAction } from '@attraccess/database-entities';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { AttractapSessionHandlerRouteContext } from './session.handler.route-context';
export abstract class ReaderUsageSessionImplementation extends AttractapSessionHandlerRouteContext {
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
}
