import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { MaintenanceRequestPersistence } from './persistence/port';
import { MaintenanceRequestStatus, ResourceMaintenanceRequest, User } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { ListMaintenanceRequestsDto } from './dtos/list-maintenance-requests.dto';
import { PaginatedMaintenanceRequestResponse } from './dtos/paginated-maintenance-request-response.dto';
import { ResolveMaintenanceRequestAction } from './dtos/resolve-maintenance-request.dto';

@Injectable()
export class MaintenanceRequestService {
  private readonly logger = new Logger(MaintenanceRequestService.name);

  constructor(
    private readonly persistence: MaintenanceRequestPersistence,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly maintenanceService: ResourceMaintenanceService,
  ) {}

  /**
   * Create a maintenance request for a resource (any authenticated user reporting a broken machine).
   */
  async createRequest(resourceId: number, userId: number, reason: string): Promise<ResourceMaintenanceRequest> {
    const resource = await this.persistence.resource(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const saved = await this.persistence.createRequest(resource, userId, reason, MaintenanceRequestStatus.OPEN);
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
  ): Promise<PaginatedMaintenanceRequestResponse> {
    const { page = 1, limit = 10, status = MaintenanceRequestStatus.OPEN } = options;

    const resource = await this.persistence.resource(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    const [data, total] = await this.persistence.requestPage(resourceId, page, limit, status);

    return { data, total, page, limit };
  }

  /**
   * Get a single request by ID with audit relations.
   */
  async getRequestById(requestId: number): Promise<ResourceMaintenanceRequest> {
    const request = await this.persistence.requestWithRelations(requestId);
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
  ): Promise<ResourceMaintenanceRequest> {
    const request = await this.getRequestById(requestId);

    if (request.resourceId !== resourceId) {
      throw new NotFoundException('Maintenance request not found');
    }

    if (request.status !== MaintenanceRequestStatus.OPEN) {
      throw new BadRequestException('Maintenance request is already resolved');
    }

    if (action === ResolveMaintenanceRequestAction.CONVERT) {
      const maintenance = await this.maintenanceService.createMaintenance(
        resourceId,
        { startTime: new Date().toISOString(), reason: reasonOverride ?? request.reason },
        userId,
      );
      request.resultingMaintenance = maintenance;
    }

    request.status =
      action === ResolveMaintenanceRequestAction.CONVERT
        ? MaintenanceRequestStatus.RESOLVED
        : MaintenanceRequestStatus.DISMISSED;
    request.resolvedByUser = { id: userId } as User;
    request.resolvedAt = new Date();

    return await this.persistence.saveRequest(request);
  }
}
