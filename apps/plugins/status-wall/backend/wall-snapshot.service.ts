import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { Clock, STATUS_WALL_CLOCK } from './constants';
import { WallStatusService, type WallTile } from './wall-status.service';
import { WallsService, type Wall } from './walls.service';

export interface WallSnapshot {
  name: string;
  generatedAt: Date;
  tiles: WallTile[];
}

/** How long a computed snapshot is shared, so several screens refreshing on the same change cost one computation. */
export const SNAPSHOT_TTL_MS = 2_000;

/** Snapshots of walls, shared briefly between the screens that show the same wall and dropped on every change. */
@Injectable()
export class WallSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<number, { expiresAt: number; snapshot: Promise<WallSnapshot> }>();
  private subscription: Subscription | null = null;

  constructor(
    @Inject(WallsService) private readonly walls: WallsService,
    @Inject(WallStatusService) private readonly status: WallStatusService,
    @Inject(STATUS_WALL_CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.subscription = this.status.changes().subscribe(() => this.cache.clear());
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  snapshot(wall: Wall): Promise<WallSnapshot> {
    const now = this.clock().getTime();
    const cached = this.cache.get(wall.id);
    if (cached && cached.expiresAt > now) return cached.snapshot;
    const snapshot = this.compute(wall);
    this.cache.set(wall.id, { expiresAt: now + SNAPSHOT_TTL_MS, snapshot });
    // A failed computation is not shared: the next request tries again.
    snapshot.catch(() => {
      if (this.cache.get(wall.id)?.snapshot === snapshot) this.cache.delete(wall.id);
    });
    return snapshot;
  }

  private async compute(wall: Wall): Promise<WallSnapshot> {
    const resourceIds = await this.walls.resourceIdsOf(wall.selection);
    return { name: wall.name, generatedAt: this.clock(), tiles: await this.status.tiles(resourceIds) };
  }
}
