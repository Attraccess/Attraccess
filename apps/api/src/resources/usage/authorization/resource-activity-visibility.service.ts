import { Resource, ResourceUsage, SupervisionMode } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SettingsService } from '../../../settings/settings.service';
import { ResourceUsageService } from '../sessions/resource-usage.service';

const LIVE_EVENT_ANONYMOUS_KEYS = new Set(['eventType', 'resourceId', 'inUse']);

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
    const permissions = user.effectivePermissions;
    if (ids.length === 0 || !permissions?.has('resources.read')) return access;

    if ((await this.settings.getResourceActivityVisibility()) === 'all') {
      for (const id of ids) access.set(id, 'full');
      return access;
    }

    if (permissions.has('resources.update') || permissions.has('resources.access.manage')) {
      for (const id of ids) access.set(id, 'full');
      return access;
    }

    const supervised = new Set(
      (await this.resources.find({ where: { id: In(ids) }, select: { id: true, supervisionMode: true } }))
        .filter(
          (resource) =>
            resource.supervisionMode === SupervisionMode.SUPERVISION_ALLOWED ||
            resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED,
        )
        .map((resource) => resource.id),
    );
    await Promise.all(
      ids.map(async (id) => {
        if (await this.usage.canControllResource(id, user)) access.set(id, 'full');
        else if (supervised.has(id)) access.set(id, 'anonymous');
      }),
    );
    return access;
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

  /** Live-feed counterpart of {@link viewUsage}: drops who is using the machine from events the viewer may not see in full. */
  viewLiveEvent(event: { data: object }, access: ResourceActivityAccess, viewerId: number): { data: object } {
    const { usage, ...rest } = event.data as { usage?: ResourceUsage; [key: string]: unknown };
    if (access === 'full' || !usage || usage.userId === viewerId) return event;
    return {
      data: Object.fromEntries(
        Object.entries({ ...rest, resourceId: usage.resourceId }).filter(([key]) => LIVE_EVENT_ANONYMOUS_KEYS.has(key)),
      ),
    };
  }
}
