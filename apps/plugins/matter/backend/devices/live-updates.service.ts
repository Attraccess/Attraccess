import type { AuthenticatedUser, PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { auditTime, filter, map, type Observable } from 'rxjs';
import { MATTER_OPERATIONS } from '../permissions';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { MatterChangeBus, type MatterChange } from './change-bus';
import { MatterLifecycleService } from './lifecycle.service';
import { idParamSchema } from './schemas';

/** Bursts of changes (a reconciliation, a telemetry batch) reach a subscriber as one signal per window. */
export const LIVE_COALESCE_MS = 250;

/** `devices`: the inventory changed. `device-state`: this endpoint's state changed. Neither carries any data. */
export type MatterLiveSignal = { changed: 'inventory' } | { changed: 'state'; endpointRef: string };

const allowed = (user: AuthenticatedUser, keys: readonly string[]) =>
  keys.every((key) => user.effectivePermissions?.has(key));

/**
 * The live topics of the device model. They are "changed" signals only: the frontend refetches through the REST API,
 * which authorizes the read again, so a topic can never reveal more than the matching REST read. Every subscribe and
 * lease renewal is authorized against `MATTER_OPERATIONS`.
 */
@Injectable()
export class MatterLiveUpdatesService implements OnModuleInit, OnModuleDestroy {
  private readonly unregister: (() => void)[] = [];

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterChangeBus) private readonly bus: MatterChangeBus,
    @Inject(MatterLifecycleService) private readonly lifecycle: MatterLifecycleService,
  ) {}

  onModuleInit(): void {
    const live = this.context.liveUpdates;
    if (!live) {
      // An older host: the page falls back to polling when the topic is unavailable.
      this.context.logger.warn?.('This host has no plugin live updates; the Matter page refreshes by polling.');
      return;
    }
    this.unregister.push(
      live.register<MatterLiveSignal>({
        topic: 'devices',
        identifier: 'none',
        authorize: (_subscription, user) => {
          if (!allowed(user, MATTER_OPERATIONS.liveDeviceInventory)) throw new ForbiddenException();
        },
        source: () => this.signals((change) => change.kind === 'inventory'),
      }),
      live.register<MatterLiveSignal>({
        topic: 'device-state',
        identifier: 'required',
        authorize: async ({ identifier }, user) => {
          if (!allowed(user, MATTER_OPERATIONS.liveDeviceState)) throw new ForbiddenException();
          if (!idParamSchema.safeParse(identifier).success) throw new NotFoundException();
          // Throws 404 for an endpoint that does not exist.
          await this.lifecycle.getEndpoint(identifier as string);
        },
        source: ({ identifier }) =>
          this.signals((change) => change.kind === 'state' && change.endpointRef === identifier),
      }),
    );
  }

  onModuleDestroy(): void {
    for (const remove of this.unregister.splice(0)) remove();
  }

  private signals(matches: (change: MatterChange) => boolean): Observable<{ data: MatterLiveSignal }> {
    return this.bus.changes.pipe(
      filter(matches),
      // Keeps the newest change of the window; a signal means "refetch", so which one it was does not matter.
      auditTime(LIVE_COALESCE_MS),
      map((change) => ({
        data:
          change.kind === 'inventory'
            ? { changed: 'inventory' }
            : { changed: 'state', endpointRef: change.endpointRef },
      })),
    );
  }
}
