import {
  ResourceFlowNodeType,
  ResourceHealthStatus,
  ResourceIntroducerType,
  ResourceType,
  SupervisionMode,
  sessionStartOf,
} from '@attraccess/application-models';
import { formatUserDisplayName } from '@attraccess/shared';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';
import { getSessionCapacity } from '../../../../resources/usage/sessions/active-usage';
import { extensionCap } from '../../../../resources/usage/session-duration/session-duration.rules';
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
  readerTimeZone: ResourceListService['readerTimeZone'];
  rbacService: ResourceListService['rbacService'];
  projectsService: ResourceListService['projectsService'];
  logger: ResourceListService['logger'];
}
/** What the reader's session list reads of a running usage session. */
interface ReaderSessionSource {
  id: number;
  userId: number;
  startTime: Date;
  sessionStartTime?: Date | null;
  projectId?: number | null;
  project?: { name: string } | null;
  previousUsageId?: number | null;
  autoEndAt?: Date | null;
  maxAutoEndAt?: Date | null;
  /** Always loaded for the active sessions the reader lists. */
  user?: { username: string; firstName?: string | null; lastName?: string | null } | null;
  supervisorUser?: { username: string; firstName?: string | null; lastName?: string | null } | null;
}

/**
 * The automatic end as the reader needs it (capabilities.sessionDuration). The seconds are relative to the moment the
 * list is built, so a reader without a wall clock still counts down; `autoEndAt` with its zone offset gives the
 * local "stops at" time. `extendLimitInSeconds` is how far the end can be pushed: the machine's maximum, or the
 * 30 day limit when it has none (`hasMaxSessionTime` tells which).
 */
function readerAutoEnd(session: ReaderSessionSource, offsetMinutes: (at: Date) => number, now: Date) {
  if (!session.autoEndAt) return {};
  const seconds = (at: Date) => Math.max(0, Math.floor((at.getTime() - now.getTime()) / 1000));
  return {
    autoEndAt: session.autoEndAt.toISOString(),
    autoEndUtcOffsetMinutes: offsetMinutes(session.autoEndAt),
    autoEndInSeconds: seconds(session.autoEndAt),
    hasMaxSessionTime: session.maxAutoEndAt != null,
    extendLimitInSeconds: seconds(
      extensionCap({
        startTime: session.startTime,
        sessionStartTime: session.sessionStartTime,
        maxAutoEndAt: session.maxAutoEndAt ?? null,
      }),
    ),
  };
}

function toReaderSession(session: ReaderSessionSource, offsetMinutes: (at: Date) => number, now = new Date()) {
  // After a project switch the reader keeps showing since when the machine has been in use.
  const startedAt = sessionStartOf(session);
  return {
    id: session.id,
    user: {
      username: session.user.username,
      displayName: formatUserDisplayName(session.user),
    },
    startTime: startedAt.toISOString(),
    // Offset (minutes east of UTC) of the reader's time zone for this
    // specific instant, so the reader can render local wall-clock time without
    // a tz database. Computed per-timestamp, so it stays DST-correct.
    startTimeUtcOffsetMinutes: offsetMinutes(startedAt),
    ...(session.supervisorUser
      ? {
          supervisorUsername: session.supervisorUser.username,
          supervisorDisplayName: formatUserDisplayName(session.supervisorUser),
        }
      : {}),
    ...readerAutoEnd(session, offsetMinutes, now),
  };
}

type ReaderSession = ReturnType<typeof toReaderSession>;

/** Readers list at most this many sessions (firmware MAX_LISTED_SESSIONS); activeSessionCount stays exact. */
export const MAX_LISTED_READER_SESSIONS = 16;

/** The card holder's own session first, then the others earliest first, capped for the reader's memory. */
function listedReaderSessions(
  sessions: ReaderSessionSource[],
  offsetMinutes: (at: Date) => number,
  own?: ReaderSessionSource,
): ReaderSession[] {
  const ordered = own ? [own, ...sessions.filter((session) => session !== own)] : sessions;
  return ordered.slice(0, MAX_LISTED_READER_SESSIONS).map((session) => toReaderSession(session, offsetMinutes));
}

/**
 * What a reader needs to offer a project switch of the card holder's own running session: the project it is booked
 * to. Not offered to somebody who has neither that nor any project to switch to.
 */
async function projectSwitchOffer(
  context: ResourceListServiceResourceListPayloadContext,
  userId: number,
  own: ReaderSessionSource,
) {
  const projectId = own.projectId ?? null;
  if (projectId === null && !(await context.projectsService.getTotalCount(userId, { search: '' }))) return {};
  return {
    canSwitchProject: true,
    ownProjectId: projectId,
    ownProjectName: own.project?.name ?? null,
    // The running record continues a split: moving it as a whole leaves the earlier parts where they are.
    ownSessionContinued: own.previousUsageId != null,
  };
}

/**
 * Readers keep only the first this many resources of the list (firmware API::MAX_RESOURCES in
 * src/api/api_types.hpp) and drop the rest, so the surplus is never sent.
 */
export const MAX_READER_RESOURCES = 10;

export async function sendResourceListToSockets(
  context: ResourceListServiceResourceListPayloadContext,
  sockets: AuthenticatedWebSocket[],
  onlyIfResourceMatches?: { resourceIds?: Set<number>; requestId?: number },
) {
  const revision = ++context.resourceListRevision;
  const readerId = sockets[0].readerId;
  const offsetMinutes = (at: Date) => context.readerTimeZone.readerUtcOffsetMinutes(readerId, at);
  const reader = await context.attractapService.findReaderById(sockets[0].readerId);
  if (!reader) {
    throw new Error(`Reader not found: ${sockets[0].readerId}`);
  }

  const attachedResources = [...reader.resources].sort((a, b) => a.name.localeCompare(b.name));

  // Matched against every attached resource: a rename can move a resource into or out of the listed ones.
  const resourceIdsToMatch = onlyIfResourceMatches?.resourceIds;
  if (resourceIdsToMatch?.size) {
    if (!attachedResources.some((resource) => resourceIdsToMatch.has(resource.id))) {
      return;
    }
  }

  const resources = attachedResources.slice(0, MAX_READER_RESOURCES);

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
        // Doors only; old firmware ignores it and shows unlock, which the API takes as the Open of the door.
        accessOnly: resource.type === ResourceType.Door && resource.accessOnly === true,
        description: resource.description,
        allowTakeOver: resource.allowTakeOver,
        // Machines only. A reader with capabilities.sessionDuration asks for the estimate; others ignore these.
        requireSessionDurationEstimate:
          resource.type === ResourceType.Machine && resource.requireSessionDurationEstimate,
        maxSessionDurationMinutes: resource.type === ResourceType.Machine ? resource.maxSessionDurationMinutes : null,
        introducers: (introducersByResourceId.get(resource.id) ?? []).flatMap((introducer) =>
          introducer.user ? [introducer.user.username] : [],
        ),
        introducerDisplayNames: (introducersByResourceId.get(resource.id) ?? []).flatMap((introducer) =>
          introducer.user ? [formatUserDisplayName(introducer.user)] : [],
        ),
        isUnderMaintenance: activeMaintenanceIds.has(resource.id),
        isHealthy: unhealthyEntries.length === 0,
        healthReason: context.buildHealthReason(unhealthyEntries),
        maxParallelSessions: capacity.maxParallelSessions,
        activeSessionCount: capacity.activeSessionCount,
        // Personalised per card: free slot and no session of one's own.
        canStart: !capacity.isFull,
        activeUsageSession: activeUsageSession ? toReaderSession(activeUsageSession, offsetMinutes) : null,
        ownUsageSession: null as ReaderSession | null,
        activeUsageSessions: listedReaderSessions(activeSessions, offsetMinutes),
        flowButtons: flowNodes.map((node) => ({ id: node.id, label: node.data.label || node.id })),
      };
    }),
  };
  // Share the expensive list queries, but never share one user's access with
  // another socket. Reuse the existing authorization cache/retraining rules.
  // Keyed by the user and whether their reader can switch projects: only such a reader is offered the switch.
  const payloadsByUser = new Map<
    string,
    Promise<typeof resourceListPayload & { authenticatedUsername: string; authenticatedDisplayName: string }>
  >();
  const forUser = async (userId: number, offersProjectSwitch: boolean) => {
    const user = await context.usersService.findOne({ id: userId });
    if (!user) return { ...resourceListPayload, authenticatedUsername: '', authenticatedDisplayName: '' };
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
        const ownUsageSession = own ? toReaderSession(own, offsetMinutes) : null;
        const canManageResource = permissions.has('resources.update');
        return {
          ...base,
          ...(offersProjectSwitch && own && resource.type === ResourceType.Machine
            ? await projectSwitchOffer(context, userId, own)
            : {}),
          // At limit 1 this is today's single session; with several sessions the caller's own comes first.
          activeUsageSession: ownUsageSession ?? base.activeUsageSession,
          ownUsageSession,
          activeUsageSessions: own
            ? listedReaderSessions(activeSessions, offsetMinutes, own)
            : base.activeUsageSessions,
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
    return {
      ...resourceListPayload,
      authenticatedUsername: user.username,
      authenticatedDisplayName: formatUserDisplayName(user),
      resources: personalized,
    };
  };
  await Promise.all(
    sockets.map(async (socket) => {
      const userId = socket.state.verifiedUserId;
      const offersProjectSwitch = socket.state.projectSwitch === true;
      const key = `${userId}:${offersProjectSwitch}`;
      if (userId != null && !payloadsByUser.has(key)) payloadsByUser.set(key, forUser(userId, offersProjectSwitch));
      const payload = userId == null ? resourceListPayload : await payloadsByUser.get(key);
      // A different card may have been presented while the queries were pending.
      if (socket.state.verifiedUserId !== userId) return;
      const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, payload);
      // Counts only: the payload names the logged-in user and every resource.
      const { revision, resources } = payload;
      context.logger.debug(
        `Sending resource list to socket ${socket.id} (revision ${revision}, ${resources.length} resources)`,
      );
      await socket.sendMessage(resourceListResponse);
    }),
  );
}
