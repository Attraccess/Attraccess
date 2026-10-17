import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFlowsService } from '../../../../resources/flows/resource-flows.service';
import { ResourceHealthService } from '../../../../resources/health/resource-health.service';
import { ResourceIntroducersService } from '../../../../resources/introducers/resourceIntroducers.service';
import { ResourceMaintenanceService } from '../../../../resources/maintenances/maintenance.service';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { RbacService } from '../../../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../../../users-and-auth/users/users.service';
import { AttractapService } from '../../../attractap.service';
import { WebsocketService } from '../../websocket.service';
import { AuthenticatedWebSocket } from '../../websocket.types';
import { sendResourceListToSockets as sendResourceListToSocketsImplementation } from './payload';
export const DEBOUNCE_MS = 200;

@Injectable()
export class ResourceListService {
  private readonly logger = new Logger(ResourceListService.name);

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(ResourceMaintenanceService)
  private resourceMaintenanceService: ResourceMaintenanceService;

  @Inject(ResourceHealthService)
  private resourceHealthService: ResourceHealthService;

  @Inject(ResourceFlowsService)
  private resourceFlowsService: ResourceFlowsService;

  @Inject(ResourceIntroducersService)
  private resourceIntroducersService: ResourceIntroducersService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(RbacService)
  private rbacService: RbacService;

  private resourceListRevision = 0;

  private readonly pendingSends = new Map<number, { timer: ReturnType<typeof setTimeout>; resourceIds: Set<number> }>();

  public async sendResourceList(readerId: number, resourceIds?: Set<number>) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    if (resourceIds) {
      await this.sendResourceListToSockets(sockets, { resourceIds });
    } else {
      await this.sendResourceListToSockets(sockets);
    }
  }

  public sendResourceListToReadersWithResources(resourceIds: number[]): void {
    if (resourceIds.length === 0) {
      return;
    }

    const readerIds = new Set<number>();
    for (const socket of this.websocketService.sockets.values()) {
      readerIds.add(socket.readerId);
    }

    for (const readerId of readerIds) {
      this.scheduleSend(readerId, resourceIds);
    }
  }

  private scheduleSend(readerId: number, resourceIds: number[]): void {
    const pending = this.pendingSends.get(readerId);
    if (pending) {
      resourceIds.forEach((resourceId) => pending.resourceIds.add(resourceId));
      return;
    }

    const pendingResourceIds = new Set(resourceIds);
    const timer = setTimeout(() => {
      this.pendingSends.delete(readerId);
      this.sendResourceList(readerId, pendingResourceIds).catch((err) => {
        this.logger.error(`Failed to send debounced resource list to reader ${readerId}`, err);
      });
    }, DEBOUNCE_MS);

    this.pendingSends.set(readerId, { timer, resourceIds: pendingResourceIds });
  }

  public async sendResourceListToSocket(
    socket: AuthenticatedWebSocket,
    onlyIfResourceMatches?: { resourceIds?: Set<number>; requestId?: number },
  ) {
    await this.sendResourceListToSockets([socket], onlyIfResourceMatches);
  }

  private async sendResourceListToSockets(
    sockets: AuthenticatedWebSocket[],
    onlyIfResourceMatches?: { resourceIds?: Set<number>; requestId?: number },
  ) {
    const getContextOwner = () => this;
    return sendResourceListToSocketsImplementation(
      {
        get resourceListRevision() {
          return getContextOwner().resourceListRevision;
        },
        set resourceListRevision(value: ResourceListService['resourceListRevision']) {
          getContextOwner().resourceListRevision = value;
        },
        get attractapService() {
          return getContextOwner().attractapService;
        },
        set attractapService(value: ResourceListService['attractapService']) {
          getContextOwner().attractapService = value;
        },
        get resourceIntroducersService() {
          return getContextOwner().resourceIntroducersService;
        },
        set resourceIntroducersService(value: ResourceListService['resourceIntroducersService']) {
          getContextOwner().resourceIntroducersService = value;
        },
        get resourceHealthService() {
          return getContextOwner().resourceHealthService;
        },
        set resourceHealthService(value: ResourceListService['resourceHealthService']) {
          getContextOwner().resourceHealthService = value;
        },
        get resourceUsageService() {
          return getContextOwner().resourceUsageService;
        },
        set resourceUsageService(value: ResourceListService['resourceUsageService']) {
          getContextOwner().resourceUsageService = value;
        },
        get resourceMaintenanceService() {
          return getContextOwner().resourceMaintenanceService;
        },
        set resourceMaintenanceService(value: ResourceListService['resourceMaintenanceService']) {
          getContextOwner().resourceMaintenanceService = value;
        },
        get resourceFlowsService() {
          return getContextOwner().resourceFlowsService;
        },
        set resourceFlowsService(value: ResourceListService['resourceFlowsService']) {
          getContextOwner().resourceFlowsService = value;
        },
        buildHealthReason: getContextOwner().buildHealthReason.bind(getContextOwner()),
        get usersService() {
          return getContextOwner().usersService;
        },
        set usersService(value: ResourceListService['usersService']) {
          getContextOwner().usersService = value;
        },
        get rbacService() {
          return getContextOwner().rbacService;
        },
        set rbacService(value: ResourceListService['rbacService']) {
          getContextOwner().rbacService = value;
        },
        logger: getContextOwner().logger,
      },
      sockets,
      onlyIfResourceMatches,
    );
  }

  private buildHealthReason(unhealthyEntries: { identifier: string; reason: string | null }[]): string {
    return unhealthyEntries
      .map((entry) => {
        const reason = (entry.reason ?? '').trim() || 'Unhealthy';
        const identifier = (entry.identifier ?? '').trim();
        return identifier ? `${identifier}: ${reason}` : reason;
      })
      .join('\n');
  }
}
