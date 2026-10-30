import { Resource, ResourceUsage, SupervisionMode } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { concatMap, filter } from 'rxjs/operators';
import { SettingsService } from '../../../settings/settings.service';
import { ResourceUsageService } from '../sessions/resource-usage.service';

/** What a viewer without full access gets from a live event: free or in use, and the machine's health. */
const LIVE_EVENT_ANONYMOUS_KEYS = new Set([
  'eventType',
  'resourceId',
  'inUse',
  'timestamp',
  'identifier',
  'status',
  'previousStatus',
  'reason',
]);

/**
 * - `full`: may see who uses the machine and the session details.
 * - `anonymous`: may only see whether the machine is free or in use (supervised-use machines).
 * - `none`: may not see any activity on the machine.
 *
 * A viewer's own sessions are always visible in full; that is decided per usage, not per resource.
 */
export type ResourceActivityAccess = 'full' | 'anonymous' | 'none';

/**
 * The single rule behind every read of equipment activity: the in-use list, active and past sessions,
 * resource reads that embed usage, the live feed and the live-updates `resource` topic.
 */
@Injectable()
export class ResourceActivityVisibilityService {
  constructor(
    private readonly settings: SettingsService,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly usage: ResourceUsageService,
  ) {}

  async resolve(user: AuthenticatedUser, resourceId: number): Promise<ResourceActivityAccess> {
    return (await this.resolveMany(user, [resourceId])).get(resourceId) ?? 'none';
  }

  async resolveMany(user: AuthenticatedUser, resourceIds: number[]): Promise<Map<number, ResourceActivityAccess>> {
    const ids = [...new Set(resourceIds)];
    const access = new Map<number, ResourceActivityAccess>(ids.map((id) => [id, 'none']));
    if (ids.length === 0) return access;
    const permissions = user.effectivePermissions;

    // Resource and access managers see all activity in both modes.
    if (permissions?.has('resources.update') || permissions?.has('resources.access.manage')) {
      for (const id of ids) access.set(id, 'full');
      return access;
    }
    if (!permissions?.has('resources.read')) return access;

    if ((await this.settings.getResourceActivityVisibility()) === 'all') {
      for (const id of ids) access.set(id, 'full');
      return access;
    }

    await Promise.all(
      ids.map(async (id) => {
        if (await this.usage.canControllResource(id, user)) access.set(id, 'full');
      }),
    );
    // Only the machines the viewer may not use need their supervision mode.
    const hidden = ids.filter((id) => access.get(id) === 'none');
    if (hidden.length > 0) {
      const resources = await this.resources.find({
        where: { id: In(hidden) },
        select: { id: true, supervisionMode: true },
      });
      for (const resource of resources) {
        if (
          resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
          resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED
        ) {
          access.set(resource.id, 'anonymous');
        }
      }
    }
    return access;
  }

  /**
   * Access to other people's past and project-linked sessions (`usage/history`, `usage/:usageId`). Narrower than
   * {@link resolve} in "all" mode: ordinary readers see only their own sessions there. Everyone else named by the
   * requirements sees all sessions: `resources.update`, `resources.access.manage`, and people introduced to the
   * machine (directly or through a group), its introducers and maintainers. That is intentionally wider than main,
   * where only `resources.update` could read other people's history.
   */
  async resolveSessions(user: AuthenticatedUser, resourceId: number): Promise<ResourceActivityAccess> {
    const access = await this.resolve(user, resourceId);
    if (access !== 'full' || (await this.settings.getResourceActivityVisibility()) !== 'all') return access;
    const permissions = user.effectivePermissions;
    if (permissions?.has('resources.update') || permissions?.has('resources.access.manage')) return 'full';
    return (await this.usage.canControllResource(resourceId, user)) ? 'full' : 'none';
  }

  /**
   * How much of the running session the viewer may see: everything with full access, otherwise only their own
   * session (`ownUsageId`), or nothing.
   */
  async activeSessionView(
    user: AuthenticatedUser,
    resourceId: number,
  ): Promise<{ full: boolean; ownUsageId: number | null }> {
    if ((await this.resolve(user, resourceId)) === 'full') return { full: true, ownUsageId: null };
    const active = await this.usage.getActiveSession(resourceId);
    return { full: false, ownUsageId: active?.userId === user.id ? active.id : null };
  }

  /**
   * Whether the viewer may open a live subscription. Hidden activity refuses it, except while the viewer runs their own
   * session on the machine; {@link viewLiveEvent} then drops every event that is not about that session.
   */
  async canFollowLive(user: AuthenticatedUser, resourceId: number, access?: ResourceActivityAccess): Promise<boolean> {
    if ((access ?? (await this.resolve(user, resourceId))) !== 'none') return true;
    return (await this.usage.getActiveSession(resourceId))?.userId === user.id;
  }

  /** The "free or in use" view for viewers who may not see who is using the machine. */
  redactUsage(usage: ResourceUsage): ResourceUsage {
    return {
      id: usage.id,
      resourceId: usage.resourceId,
      usageAction: usage.usageAction,
      startTime: usage.startTime,
      endTime: usage.endTime,
    } as ResourceUsage;
  }

  /** Returns the usage as the viewer may see it, or null when they may not see it at all. */
  viewUsage(usage: ResourceUsage, access: ResourceActivityAccess, viewerId: number): ResourceUsage | null {
    if (usage.userId === viewerId || access === 'full') return usage;
    return access === 'anonymous' ? this.redactUsage(usage) : null;
  }

  /** Applies {@link viewUsage} to every usage embedded in resources. */
  applyToResources(resources: Resource[], access: Map<number, ResourceActivityAccess>, viewerId: number): Resource[] {
    return resources.map((resource) => {
      if (!resource.usages) return resource;
      const resourceAccess = access.get(resource.id) ?? 'none';
      const usages = resource.usages
        .map((usage) => this.viewUsage(usage, resourceAccess, viewerId))
        .filter((usage): usage is ResourceUsage => usage !== null);
      return { ...resource, usages };
    });
  }

  /**
   * Live-feed counterpart of {@link viewUsage}. Returns the event as the viewer may see it, or null to drop it.
   * Anything short of full access is reduced to an allowlist, so a new event field never leaks a name by default.
   */
  viewLiveEvent(event: { data: object }, access: ResourceActivityAccess, viewerId: number): { data: object } | null {
    const data = event.data as { usage?: ResourceUsage; keepalive?: unknown; [key: string]: unknown };
    if ('keepalive' in data) return event;
    if (access === 'full' || (data.usage && data.usage.userId === viewerId)) return event;
    // Ended and taken-over events carry no usage, only the session owner's id: that owner still hears the change.
    if (access === 'none' && data['ownerUserId'] !== viewerId) return null;
    const resourceId = data.usage?.resourceId ?? data['resourceId'];
    return {
      data: Object.fromEntries(
        Object.entries({ ...data, resourceId }).filter(([key]) => LIVE_EVENT_ANONYMOUS_KEYS.has(key)),
      ),
    };
  }

  /**
   * Applies the rule to a resource's live stream. Access is looked up again for every event (keepalives excepted),
   * so a changed setting or a revoked introduction takes effect on open streams. The viewer's permissions are the
   * ones from when the stream opened; a role change applies on the next connect.
   */
  viewLiveStream<T extends { data: object }>(
    stream: Observable<T>,
    user: AuthenticatedUser,
    resourceId: number,
  ): Observable<{ data: object }> {
    return stream.pipe(
      concatMap(async (event) => {
        if ('keepalive' in event.data) return event;
        return this.viewLiveEvent(event, await this.resolve(user, resourceId), user.id);
      }),
      filter((event): event is { data: object } => event !== null),
    );
  }
}
