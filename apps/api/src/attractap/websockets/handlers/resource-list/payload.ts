import {
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceHealthStatus,
  ResourceIntroducerType,
  SupervisionMode,
} from '@attraccess/database-entities';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';
import { getSessionCapacity } from '../../../../resources/usage/sessions/active-usage';
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
function toReaderSession(session: ResourceUsage) {
  return {
    id: session.id,
    user: {
      username: session.user.username,
    },
    startTime: session.startTime.toISOString(),
    // Offset (minutes east of UTC) of the API's effective timezone for this
    // specific instant, so the reader can render local wall-clock time without
    // a tz database. Computed per-timestamp, so it stays DST-correct.
    startTimeUtcOffsetMinutes: -session.startTime.getTimezoneOffset(),
    ...(session.supervisorUser ? { supervisorUsername: session.supervisorUser.username } : {}),
  };
}

type ReaderSession = ReturnType<typeof toReaderSession>;

/** Readers list at most this many sessions (firmware MAX_LISTED_SESSIONS); activeSessionCount stays exact. */
export const MAX_LISTED_READER_SESSIONS = 16;

/** The card holder's own session first, then the others earliest first, capped for the reader's memory. */
function listedReaderSessions(sessions: ResourceUsage[], own?: ResourceUsage): ReaderSession[] {
  const ordered = own ? [own, ...sessions.filter((session) => session !== own)] : sessions;
  return ordered.slice(0, MAX_LISTED_READER_SESSIONS).map(toReaderSession);
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
      const activeSessions = activeSessionMap.get(resource.id) ?? [];
      // Newest session; personalised below to the authenticated user's own session when they have one.
      const activeUsageSession = activeSessions[activeSessions.length - 1] ?? null;
      const capacity = getSessionCapacity(resource, activeSessions.length);
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
        maxParallelSessions: capacity.maxParallelSessions,
        activeSessionCount: capacity.activeSessionCount,
        // Personalised per card: free slot and no session of one's own.
        canStart: !capacity.isFull,
        activeUsageSession: activeUsageSession ? toReaderSession(activeUsageSession) : null,
        ownUsageSession: null as ReaderSession | null,
        activeUsageSessions: listedReaderSessions(activeSessions),
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
        const base = resourceListPayload.resources[index];
        const activeSessions = activeSessionMap.get(resource.id) ?? [];
        const own = activeSessions.find((session) => session.userId === userId);
        const ownUsageSession = own ? toReaderSession(own) : null;
        const canManageResource = permissions.has('resources.update');
        return {
          ...base,
          // At limit 1 this is today's single session; with several sessions the caller's own comes first.
          activeUsageSession: ownUsageSession ?? base.activeUsageSession,
          ownUsageSession,
          activeUsageSessions: own ? listedReaderSessions(activeSessions, own) : base.activeUsageSessions,
          canStart: base.canStart && !own,
          hasIntroduction,
          canManageMaintenance: maintenanceManagedResourceIds.has(resource.id),
          isIntroducer: (introducersByResourceId.get(resource.id) ?? []).some((role) => role.userId === userId),
          canManageResource,
          // Same rule endSession applies to ending somebody else's chosen session. Only looked up while
          // someone else's session runs, so idle resources cost no extra query per card.
          canEndOtherSessions:
            canManageResource ||
            (activeSessions.some((session) => session.userId !== userId) &&
              (await context.resourceIntroducersService.canMaintain(resource.id, userId, true))),
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
