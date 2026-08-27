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

const DEBOUNCE_MS = 200;

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
    onlyIfResourceMatches?: { resourceIds?: Set<number> },
  ) {
    await this.sendResourceListToSockets([socket], onlyIfResourceMatches);
  }

  private async sendResourceListToSockets(
    sockets: AuthenticatedWebSocket[],
    onlyIfResourceMatches?: { resourceIds?: Set<number> },
  ) {
    const reader = await this.attractapService.findReaderById(sockets[0].readerId);
    if (!reader) {
      throw new Error(`Reader not found: ${sockets[0].readerId}`);
    }

    const resources = [...reader.resources].sort((a, b) => a.name.localeCompare(b.name));

    const resourceIdsToMatch = onlyIfResourceMatches?.resourceIds;
    if (resourceIdsToMatch?.size) {
      if (!resources.some((resource) => resourceIdsToMatch.has(resource.id))) {
        return;
      }
    }

    const resourceIds = resources.map((resource) => resource.id);
    const [introducersByResourceId, healthMap, activeSessionMap, activeMaintenanceIds, flowButtonMap] = await Promise.all([
      this.resourceIntroducersService.getManyForResources(resourceIds, ResourceIntroducerType.INTRODUCER),
      this.resourceHealthService.listForResources(resourceIds),
      this.resourceUsageService.getActiveSessions(resourceIds),
      this.resourceMaintenanceService.getActiveMaintenanceResourceIds(resourceIds),
      this.resourceFlowsService.getNodesForResources(resourceIds, ResourceFlowNodeType.INPUT_BUTTON),
    ]);

    const resourceListPayload = {
      readerName: reader.name,
      ledBrightness: reader.ledBrightness,
      resources: resources.map((resource) => {
        const healthEntries = healthMap.get(resource.id) ?? [];
        const unhealthyEntries = healthEntries.filter((entry) => entry.status === ResourceHealthStatus.UNHEALTHY);
        const activeUsageSession = activeSessionMap.get(resource.id) ?? null;
        const flowNodes = flowButtonMap.get(resource.id) ?? [];

        return {
          id: resource.id,
          name: resource.name,
          type: resource.type,
          separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
          description: resource.description,
          allowTakeOver: resource.allowTakeOver,
          introducers: (introducersByResourceId.get(resource.id) ?? []).flatMap((introducer) =>
            introducer.user ? [introducer.user.username] : []),
          isUnderMaintenance: activeMaintenanceIds.has(resource.id),
          isHealthy: unhealthyEntries.length === 0,
          healthReason: this.buildHealthReason(unhealthyEntries),
          activeUsageSession: activeUsageSession
          ? {
            user: {
              username: activeUsageSession.user.username,
            },
            startTime: activeUsageSession.startTime.toISOString(),
            // Offset (minutes east of UTC) of the API's effective timezone for this
            // specific instant, so the reader can render local wall-clock time without
            // a tz database. Computed per-timestamp, so it stays DST-correct.
            startTimeUtcOffsetMinutes: -activeUsageSession.startTime.getTimezoneOffset(),
          }
          : null,
          flowButtons: flowNodes.map((node) => ({ id: node.id, label: node.data.label || node.id })),
        };
      }),
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
