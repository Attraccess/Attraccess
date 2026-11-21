import { SystemEvent, type SystemEventSubscription } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Clock, PLUGIN_CONTEXT, STATUS_WALL_CLOCK, type PluginContext } from './constants';

/** Traffic light of one resource: red under maintenance, amber in use, green ready. */
export type ResourceState = 'maintenance' | 'in-use' | 'ready';

export interface WallTile {
  id: number;
  name: string;
  imageUrl: string | null;
  state: ResourceState;
  /** When the current state began (session or maintenance start); null when ready. */
  since: Date | null;
}

/** Resources checked at once; each check reads sessions and maintenance of one resource. */
const LOOKUP_CONCURRENCY = 10;

/**
 * Computes the live state of resources and reports when one may have changed. A wall shows nothing about people:
 * neither who uses a machine nor why it is under maintenance.
 */
@Injectable()
export class WallStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly changed = new Subject<number>();
  private subscriptions: SystemEventSubscription[] = [];

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(STATUS_WALL_CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    const report = (payload: { resourceId: number }) => this.changed.next(payload.resourceId);
    this.subscriptions = [
      this.context.onEvent(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, report),
      this.context.onEvent(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, report),
      this.context.onEvent(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, report),
      this.context.onEvent(SystemEvent.MAINTENANCE_CHANGED, report),
    ];
  }

  onModuleDestroy(): void {
    for (const subscription of this.subscriptions) subscription.off();
    this.subscriptions = [];
    this.changed.complete();
  }

  /** Ids of resources whose session or maintenance state changed. */
  changes(): Observable<number> {
    return this.changed.asObservable();
  }

  /** The tiles of the given resources (every resource when undefined), in name order. */
  async tiles(resourceIds: number[] | undefined): Promise<WallTile[]> {
    const resources = await this.context.hostData.resources.listDisplay(resourceIds);
    const tiles: WallTile[] = [];
    for (let offset = 0; offset < resources.length; offset += LOOKUP_CONCURRENCY) {
      const chunk = resources.slice(offset, offset + LOOKUP_CONCURRENCY);
      const states = await Promise.all(chunk.map((resource) => this.stateOf(resource.id)));
      chunk.forEach((resource, index) => tiles.push({ ...resource, ...states[index] }));
    }
    return tiles;
  }

  private async stateOf(resourceId: number): Promise<Pick<WallTile, 'state' | 'since'>> {
    const now = this.clock();
    const access = this.context.resourceAccess;
    const [windows, sessions] = await Promise.all([
      access.getMaintenanceWindows(resourceId, now, new Date(now.getTime() + 1)),
      access.getActiveSessions(resourceId),
    ]);
    if (windows.length > 0) return { state: 'maintenance', since: earliest(windows.map((w) => w.startTime)) };
    if (sessions.length > 0) return { state: 'in-use', since: earliest(sessions.map((s) => s.startTime)) };
    return { state: 'ready', since: null };
  }
}

const earliest = (dates: Date[]): Date => new Date(Math.min(...dates.map((date) => new Date(date).getTime())));
