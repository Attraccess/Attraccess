import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { MaintenanceRequestStatus, type ResourceMaintenanceRequestRecord } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { ListMaintenanceRequestsDto } from './dtos/list-maintenance-requests.dto';
import { ResolveMaintenanceRequestAction } from './dtos/resolve-maintenance-request.dto';
import { MAINTENANCE_REQUEST_STORE, type MaintenanceRequestStore } from './maintenance-request-store.port';

@Injectable()
export class MaintenanceRequestService {
  constructor(
    @Inject(MAINTENANCE_REQUEST_STORE)
    private readonly store: MaintenanceRequestStore,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly maintenanceService: ResourceMaintenanceService,
  ) {}

  /**
   * Create a maintenance request for a resource (any authenticated user reporting a broken machine).
   */
  async createRequest(resourceId: number, userId: number, reason: string): Promise<ResourceMaintenanceRequestRecord> {
    if (!(await this.store.resourceExists(resourceId))) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const saved = await this.store.create(resourceId, userId, reason);
    this.eventEmitter.emit(
      ResourceMaintenanceRequestCreatedEvent.EVENT_NAME,
      new ResourceMaintenanceRequestCreatedEvent(resourceId, saved.id),
    );
    return saved;
  }

  /**
   * List maintenance requests of a resource with pagination. Defaults to open requests only.
   */
  async listRequests(
    resourceId: number,
    options: ListMaintenanceRequestsDto = {},
  ): Promise<{ data: ResourceMaintenanceRequestRecord[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, status = MaintenanceRequestStatus.OPEN } = options;
    const skip = (page - 1) * limit;

    if (!(await this.store.resourceExists(resourceId))) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const { data, total } = await this.store.page(resourceId, status, skip, limit);

    return { data, total, page, limit };
  }

  /**
   * Get a single request by ID with audit relations.
   */
  async getRequestById(requestId: number): Promise<ResourceMaintenanceRequestRecord> {
    const request = await this.store.findById(requestId);
    if (!request) {
      throw new NotFoundException(`Maintenance request with ID ${requestId} not found`);
    }
    return request;
  }

  /**
   * Resolve an open request. 'convert' starts an instant maintenance from it; 'dismiss' closes it.
   * Only maintenance users reach this (guarded at the controller).
   */
  async resolveRequest(
    resourceId: number,
    requestId: number,
    userId: number,
    action: ResolveMaintenanceRequestAction,
    reasonOverride?: string,
  ): Promise<ResourceMaintenanceRequestRecord> {
    const request = await this.getRequestById(requestId);

    if (request.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance request not found');
    }

    if (request.status !== MaintenanceRequestStatus.OPEN) {
      throw new BadRequestException('Maintenance request is already resolved');
    }

    const converting = action === ResolveMaintenanceRequestAction.CONVERT;
    const maintenance = converting
      ? await this.maintenanceService.createMaintenance(
          resourceId,
          { startTime: new Date().toISOString(), reason: reasonOverride ?? request.reason },
          userId,
        )
      : undefined;

    return await this.store.resolve(requestId, {
      status: converting ? MaintenanceRequestStatus.RESOLVED : MaintenanceRequestStatus.DISMISSED,
      resolvedByUserId: userId,
      resolvedAt: new Date(),
      resultingMaintenanceId: maintenance?.id,
    });
  }
}
