import { Inject, Injectable, Logger } from '@nestjs/common';
import { BillingService } from '../../../billing/billing.service';
import { SumUpService } from '../../../billing/sumup.service';
import { FlowExecutionError } from '../../../resources/flows/errors/flow-execution.error';
import { ResourceFlowsExecutorService } from '../../../resources/flows/resource-flows-executor.service';
import { ResourceMeteringService } from '../../../resources/metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../../../resources/operating-intervals/resource-operating-attribution.service';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { AttractapFormsHandler } from './forms.handler';
import { ReaderDoorActionsImplementation } from './reader-door-actions';
import { ResourceActionGuard } from './resource-action.guard';
import { ResourceListService } from './resource-list.service';

@Injectable()
export class AttractapSessionHandler extends ReaderDoorActionsImplementation {
  protected readonly logger = new Logger(AttractapSessionHandler.name);

  @Inject(UsersService)
  protected usersService: UsersService;

  @Inject(ResourceUsageService)
  protected resourceUsageService: ResourceUsageService;

  @Inject(ResourceFlowsExecutorService)
  protected resourceFlowsExecutorService: ResourceFlowsExecutorService;

  @Inject(SumUpService)
  protected sumUpService: SumUpService;

  @Inject(BillingService)
  protected billingService: BillingService;

  @Inject(ResourceActionGuard)
  protected resourceActionGuard: ResourceActionGuard;

  @Inject(ResourceListService)
  protected resourceListService: ResourceListService;

  @Inject(AttractapFormsHandler)
  protected formsHandler: AttractapFormsHandler;

  @Inject(SupervisionService)
  protected supervisionService: SupervisionService;

  @Inject(ResourceMeteringService)
  protected meteringService: ResourceMeteringService;

  @Inject(ResourceOperatingAttributionService)
  protected operatingAttributionService: ResourceOperatingAttributionService;

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
      const usage = await this.resourceUsageService.getActiveSession(resourceId, false);
      // Live session readings belong to the current user, just like the active-session web UI.
      if (!usage || usage.userId !== userId) {
        await this.reply(socket, data, AttractapEventType.RESOURCE_USAGE_STATS, { resourceId, usage: null });
        return;
      }
      const asOf = new Date();
      const [meter, operating] = await Promise.all([
        this.meteringService.getLive(resourceId),
        this.operatingAttributionService.getForResource(resourceId, asOf, usage.startTime),
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
          // Never attach a new session's meter reading to an earlier usage snapshot.
          energyKwh: meter.session?.usageId === usage.id ? meter.session.latestKwh : null,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to load live usage stats: ${error.message}`);
      await this.reply(socket, data, AttractapEventType.RESOURCE_USAGE_STATS, { resourceId, usage: null });
    }
  }

  protected reply(
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

  protected extractUserFacingError(error: unknown): string {
    if (error instanceof FlowExecutionError) {
      return error.message.replace(/^FLOW_EXECUTION_ERROR:\s*/, '');
    }
    return error instanceof Error ? error.message : String(error);
  }
}
