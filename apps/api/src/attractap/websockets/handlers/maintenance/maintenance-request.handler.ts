import { Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LicenseService } from '../../../../license/license.service';
import { CreateMaintenanceRequestDto } from '../../../../resources/maintenances/dtos/create-maintenance-request.dto';
import { isMaintenanceLicensed } from '../../../../resources/maintenances/maintenance-license';
import { MaintenanceRequestService } from '../../../../resources/maintenances/maintenance-request.service';
import { ResourceListVisibilityService } from '../../../../resources/visibility/resource-list-visibility.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';
import { ResourceActionGuard } from '../resource-action.guard';
import { CardSessionService } from '../ui/card-session.service';

/** "Report a problem" on a reader: a maintenance request by the card holder, like the one of the resource page. */
@Injectable()
export class AttractapMaintenanceRequestHandler {
  private readonly logger = new Logger(AttractapMaintenanceRequestHandler.name);

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

  @Inject(MaintenanceRequestService)
  private maintenanceRequests: MaintenanceRequestService;

  @Inject(LicenseService)
  private licenseService: LicenseService;

  @Inject(CardSessionService)
  private cardSessions: CardSessionService;

  @Inject(ResourceListVisibilityService)
  private listVisibility: ResourceListVisibilityService;

  @Inject(RbacService)
  private rbacService: RbacService;

  public async handleCreateMaintenanceRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    // The reader may end its login (READER_SESSION_ENDED) while this runs: act for the user who asked.
    const userId = socket.state.verifiedUserId;
    const { resourceId, reason, requestId, cardSessionId } = (data.payload ?? {}) as {
      resourceId: number;
      reason?: unknown;
      requestId?: number;
      cardSessionId?: unknown;
    };
    const type = AttractapEventType.CREATE_MAINTENANCE_REQUEST;
    this.cardSessions.resume(socket, cardSessionId, userId);

    if (!(await this.resourceActionGuard.validateResourceAction(socket, resourceId, type, requestId))) {
      return;
    }

    const reply = (result: { success: true } | { error: string }) =>
      socket.sendMessage(
        new AttractapEvent(type, {
          ...result,
          ...(Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {}),
        }),
      );

    try {
      if (!(await isMaintenanceLicensed(this.licenseService))) {
        await reply({ error: 'MAINTENANCE_NOT_LICENSED' });
        return;
      }
      // The web route answers 404 for a machine the user may not see; so does the reader.
      const effectivePermissions = await this.rbacService.getEffectivePermissions(userId);
      if (!(await this.listVisibility.canSee({ id: userId, effectivePermissions }, resourceId))) {
        await reply({ error: 'RESOURCE_NOT_FOUND' });
        return;
      }
      const dto = plainToInstance(CreateMaintenanceRequestDto, { reason });
      if ((await validate(dto)).length > 0) {
        await reply({ error: 'INVALID_REASON' });
        return;
      }
      await this.maintenanceRequests.createRequest(resourceId, userId, dto.reason);
    } catch (error) {
      this.logger.error(`Failed to create maintenance request: ${(error as Error).message}`);
      await reply({ error: 'REQUEST_FAILED' });
      return;
    }
    await reply({ success: true });
  }
}
