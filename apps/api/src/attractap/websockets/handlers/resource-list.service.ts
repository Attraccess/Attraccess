import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFlowNodeType, ResourceHealthStatus, ResourceIntroducerType } from '@attraccess/database-entities';
import { WebsocketService } from '../websocket.service';
import { AttractapService } from '../../attractap.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { ResourceMaintenanceService } from '../../../resources/maintenances/maintenance.service';
import { ResourceHealthService } from '../../../resources/health/resource-health.service';
import { ResourceFlowsService } from '../../../resources/flows/resource-flows.service';
import { ResourceIntroducersService } from '../../../resources/introducers/resourceIntroducers.service';
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

  @Inject(ResourceHealthService)
  private resourceHealthService: ResourceHealthService;

  @Inject(ResourceFlowsService)
  private resourceFlowsService: ResourceFlowsService;

  @Inject(ResourceIntroducersService)
  private resourceIntroducersService: ResourceIntroducersService;

  public async sendResourceList(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await this.sendResourceListToSockets(sockets);
  }

  public async sendResourceListToReadersWithResources(resourceIds: number[]) {
    if (resourceIds.length === 0) {
      return;
    }

    const socketsByReaderId = new Map<number, AuthenticatedWebSocket[]>();
    for (const socket of this.websocketService.sockets.values()) {
      const sockets = socketsByReaderId.get(socket.readerId) ?? [];
      sockets.push(socket);
      socketsByReaderId.set(socket.readerId, sockets);
    }

    await Promise.all(
      Array.from(socketsByReaderId.values()).map((sockets) => this.sendResourceListToSockets(sockets, { resourceIds })),
    );
  }

  public async sendResourceListToSocket(
    socket: AuthenticatedWebSocket,
    onlyIfResourceMatches?: { resourceIds?: number[] },
  ) {
    await this.sendResourceListToSockets([socket], onlyIfResourceMatches);
  }

  private async sendResourceListToSockets(
    sockets: AuthenticatedWebSocket[],
    onlyIfResourceMatches?: { resourceIds?: number[] },
  ) {
    const reader = await this.attractapService.findReaderById(sockets[0].readerId);
    if (!reader) {
      throw new Error(`Reader not found: ${sockets[0].readerId}`);
    }

    const resources = [...reader.resources].sort((a, b) => a.name.localeCompare(b.name));

    const resourceIdsToMatch = onlyIfResourceMatches?.resourceIds ?? [];
    if (resourceIdsToMatch.length > 0) {
      if (!resources.some((resource) => resourceIdsToMatch.includes(resource.id))) {
        return;
      }
    }

    const introducersByResourceId = await this.resourceIntroducersService.getManyForResources(
      resources.map((resource) => resource.id),
      ResourceIntroducerType.INTRODUCER,
    );
    const resourcesWithUsageSession = await Promise.all(
      resources.map(async (resource) => {
        const [healthEntries, activeUsageSession, isUnderMaintenance] = await Promise.all([
          this.resourceHealthService.listForResource(resource.id),
          this.resourceUsageService.getActiveSession(resource.id, true),
          this.resourceMaintenanceService.hasActiveMaintenance(resource.id),
        ]);
        const unhealthyEntries = healthEntries.filter((entry) => entry.status === ResourceHealthStatus.UNHEALTHY);
        return {
          ...resource,
          activeUsageSession,
          introducers: introducersByResourceId.get(resource.id) ?? [],
          isUnderMaintenance,
          isHealthy: unhealthyEntries.length === 0,
          healthReason: this.buildHealthReason(unhealthyEntries),
        };
      }),
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

    const resourceListPayload = {
      readerName: reader.name,
      ledBrightness: reader.ledBrightness,
      resources: resourcesWithFlowButtons.map((resource) => ({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
        description: resource.description,
        allowTakeOver: resource.allowTakeOver,
        introducers: resource.introducers.flatMap((introducer) => (introducer.user ? [introducer.user.username] : [])),
        isUnderMaintenance: resource.isUnderMaintenance,
        isHealthy: resource.isHealthy,
        healthReason: resource.healthReason,
        activeUsageSession: resource.activeUsageSession
          ? {
            user: {
              username: resource.activeUsageSession.user.username,
            },
            startTime: resource.activeUsageSession.startTime.toISOString(),
            // Offset (minutes east of UTC) of the API's effective timezone for this
            // specific instant, so the reader can render local wall-clock time without
            // a tz database. Computed per-timestamp, so it stays DST-correct.
            startTimeUtcOffsetMinutes: -resource.activeUsageSession.startTime.getTimezoneOffset(),
          }
          : null,
        flowButtons: resource.flowButtons,
      })),
    };
    await Promise.all(
      sockets.map(async (socket) => {
        const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, resourceListPayload);
        this.logger.debug(`Sending resource list to socket ${socket.id}`, resourceListResponse);
        await socket.sendMessage(resourceListResponse);
      }),
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
