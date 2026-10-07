import { Logger } from '@nestjs/common';
import { BillingService } from '../../../billing/billing.service';
import { SumUpService } from '../../../billing/sumup.service';
import { ResourceFlowsExecutorService } from '../../../resources/flows/resource-flows-executor.service';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { AttractapFormsHandler } from './forms.handler';
import { ResourceActionGuard } from './resource-action.guard';
import { ResourceListService } from './resource-list.service';

export abstract class AttractapSessionHandlerRouteContext {
  protected abstract resourceActionGuard: ResourceActionGuard;
  protected abstract formsHandler: AttractapFormsHandler;
  protected abstract usersService: UsersService;
  protected abstract reply(
    socket: AuthenticatedWebSocket,
    request: AttractapEvent['data'],
    type: AttractapEventType,
    payload: Record<string, unknown>,
  ): Promise<boolean>;
  protected abstract resourceUsageService: ResourceUsageService;
  protected abstract supervisionService: SupervisionService;
  protected abstract resourceListService: ResourceListService;
  protected abstract sumUpService: SumUpService;
  protected abstract readonly logger: Logger;
  protected abstract billingService: BillingService;
  protected abstract extractUserFacingError(error: unknown): string;
  protected abstract resourceFlowsExecutorService: ResourceFlowsExecutorService;
}
