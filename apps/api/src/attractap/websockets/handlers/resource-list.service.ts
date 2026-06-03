import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { WebsocketService } from '../websocket.service';
import { AttractapService } from '../../attractap.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceMaintenanceService } from '../../../resources/maintenances/maintenance.service';
import { ResourceFlowsService } from '../../../resources/flows/resource-flows.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

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

  @Inject(ResourceFlowsService)
  private resourceFlowsService: ResourceFlowsService;

  public async sendResourceList(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await Promise.all(sockets.map((socket) => this.sendResourceListToSocket(socket)));
  }

  public async sendResourceListToReadersWithResource(resourceId: number) {
    const allSockets = Array.from(this.websocketService.sockets.values());
    await Promise.all(allSockets.map((socket) => this.sendResourceListToSocket(socket, { resourceId })));
  }

  public async sendResourceListToSocket(
    socket: AuthenticatedWebSocket,
    onlyIfResourceMatches?: { resourceId?: number },
  ) {
    const reader = await this.attractapService.findReaderById(socket.readerId);
    if (!reader) {
      throw new Error(`Reader not found: ${socket.readerId}`);
    }

    const resources = reader.resources;

    if (onlyIfResourceMatches?.resourceId) {
      if (!resources.some((resource) => resource.id === onlyIfResourceMatches.resourceId)) {
        return;
      }
    }

    const resourcesWithUsageSession = await Promise.all(
      resources.map(async (resource) => ({
        ...resource,
        activeUsageSession: await this.resourceUsageService.getActiveSession(resource.id, true),
        isUnderMaintenance: await this.resourceMaintenanceService.hasActiveMaintenance(resource.id),
      })),
    );

    const getFlowButtons = async (resourceId: number) => {
      const nodes = await this.resourceFlowsService.getNodes(resourceId, ResourceFlowNodeType.INPUT_BUTTON);
      return nodes.map((node) => ({
        id: node.id,
        label: node.data.label || node.id,
      }));
    };

    const resourcesWithFlowButtons = await Promise.all(
      resourcesWithUsageSession.map(async (resource) => ({
        ...resource,
        flowButtons: await getFlowButtons(resource.id),
      })),
    );

    const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, {
      readerName: reader.name,
      ledBrightness: reader.ledBrightness,
      resources: resourcesWithFlowButtons.map((resource) => ({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
        description: resource.description,
        allowTakeOver: resource.allowTakeOver,
        introducers: resource.introducers.map((introducer) => introducer.user.username),
        isUnderMaintenance: resource.isUnderMaintenance,
        activeUsageSession: resource.activeUsageSession
          ? {
            user: {
              username: resource.activeUsageSession.user.username,
            },
            startTime: resource.activeUsageSession.startTime.toISOString(),
          }
          : null,
        flowButtons: resource.flowButtons,
      })),
    });
    this.logger.debug(`Sending resource list to socket ${socket.id}`, resourceListResponse);
    await socket.sendMessage(resourceListResponse);
  }
}
