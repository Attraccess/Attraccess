import {
  ResourceFlowNodeType,
  ResourceHealthStatus,
  ResourceIntroducerType,
  SupervisionMode,
} from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import type { ResourceListService } from './resource-list.service';

interface ResourceListServiceResourceListPayloadContext {
  resourceListRevision: ResourceListService['resourceListRevision'];
  attractapService: ResourceListService['attractapService'];
  resourceIntroducersService: ResourceListService['resourceIntroducersService'];
  resourceHealthService: ResourceListService['resourceHealthService'];
  resourceUsageService: ResourceListService['resourceUsageService'];
  resourceMaintenanceService: ResourceListService['resourceMaintenanceService'];
  resourceFlowsService: ResourceListService['resourceFlowsService'];
  buildHealthReason: ResourceListService['buildHealthReason'];
  usersService: ResourceListService['usersService'];
  rbacService: ResourceListService['rbacService'];
  logger: ResourceListService['logger'];
}
export async function sendResourceListToSockets(
  context: ResourceListServiceResourceListPayloadContext,
  sockets: AuthenticatedWebSocket[],
  onlyIfResourceMatches?: { resourceIds?: Set<number>; requestId?: number },
) {
  const revision = ++context.resourceListRevision;
  const reader = await context.attractapService.findReaderById(sockets[0].readerId);
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
  const [introducersByResourceId, healthMap, activeSessionMap, activeMaintenanceIds, flowButtonMap] = await Promise.all(
    [
      context.resourceIntroducersService.getManyForResources(resourceIds, ResourceIntroducerType.INTRODUCER),
      context.resourceHealthService.listForResources(resourceIds),
      context.resourceUsageService.getActiveSessions(resourceIds),
      context.resourceMaintenanceService.getActiveMaintenanceResourceIds(resourceIds),
      context.resourceFlowsService.getNodesForResources(resourceIds, ResourceFlowNodeType.INPUT_BUTTON),
    ],
  );

  const requestId = onlyIfResourceMatches?.requestId;
  const resourceListPayload = {
    revision,
    ...(Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {}),
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
          introducer.user ? [introducer.user.username] : [],
        ),
        isUnderMaintenance: activeMaintenanceIds.has(resource.id),
        isHealthy: unhealthyEntries.length === 0,
        healthReason: context.buildHealthReason(unhealthyEntries),
        activeUsageSession: activeUsageSession
          ? {
              id: activeUsageSession.id,
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
  // Share the expensive list queries, but never share one user's access with
  // another socket. Reuse the existing authorization cache/retraining rules.
  const payloadsByUser = new Map<number, Promise<typeof resourceListPayload & { authenticatedUsername: string }>>();
  const forUser = async (userId: number) => {
    const user = await context.usersService.findOne({ id: userId });
    if (!user) return { ...resourceListPayload, authenticatedUsername: '' };
    const permissions = await context.rbacService.getEffectivePermissions(userId);
    const maintenanceManagedResourceIds = await context.resourceMaintenanceService.getMaintenanceManagedResourceIds(
      user,
      resourceIds,
      permissions,
    );
    const personalized = await Promise.all(
      resources.map(async (resource, index) => {
        const hasIntroduction = await context.resourceUsageService.canControllResource(resource.id, user);
        return {
          ...resourceListPayload.resources[index],
          hasIntroduction,
          canManageMaintenance: maintenanceManagedResourceIds.has(resource.id),
          isIntroducer: (introducersByResourceId.get(resource.id) ?? []).some((role) => role.userId === userId),
          canManageResource: permissions.has('resources.update'),
          requiresSupervisor:
            resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED ||
            (resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED && !hasIntroduction),
        };
      }),
    );
    return { ...resourceListPayload, authenticatedUsername: user.username, resources: personalized };
  };
  await Promise.all(
    sockets.map(async (socket) => {
      const userId = socket.state.lastAuthenticatedUserId;
      if (userId != null && !payloadsByUser.has(userId)) payloadsByUser.set(userId, forUser(userId));
      const payload = userId == null ? resourceListPayload : await payloadsByUser.get(userId);
      // A different card may have been presented while the queries were pending.
      if (socket.state.lastAuthenticatedUserId !== userId) return;
      const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, payload);
      context.logger.debug(`Sending resource list to socket ${socket.id}`, resourceListResponse);
      await socket.sendMessage(resourceListResponse);
    }),
  );
}
