import { ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createSharedLiveSampler, type AuthenticatedUser, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './controllers/service';
import { WagoCommissioningService } from './commissioning/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoManagedRuntimeService } from './runtime/managed/service';
import { WagoNetworkChangeService } from './network/service';
import { WagoController } from './controllers/entity';
import { WagoCommissioningSession } from './commissioning/sessions/session.entity';

/** Sample authoritative services once per active topic, shared across tabs/users. */
@Injectable()
export class WagoLiveUpdatesService implements OnModuleInit {
  private readonly sample = createSharedLiveSampler<string>();

  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
    @Inject(WagoCommissioningService) private readonly commissioning: WagoCommissioningService,
    @Inject(WagoDiagnosticsService) private readonly diagnostics: WagoDiagnosticsService,
    @Inject(WagoManagedRuntimeService) private readonly managed: WagoManagedRuntimeService,
    @Inject(WagoNetworkChangeService) private readonly network: WagoNetworkChangeService,
  ) {}

  onModuleInit(): void {
    const live = this.context.liveUpdates;
    if (!live) throw new Error('WAGO live updates require a host with plugin live-update support');
    const register = (
      topic: string,
      interval: number,
      permission: string,
      kind: 'none' | 'controller' | 'session' | 'revisions',
      read: (id: number, offset: number) => Promise<unknown>,
    ) => {
      live.register({
        topic,
        identifier: kind === 'none' ? 'none' : 'required',
        authorize: async ({ identifier }, user: AuthenticatedUser) => {
          if (!user.effectivePermissions?.has(permission)) throw new ForbiddenException();
          if (kind === 'none') return;
          const pattern = kind === 'revisions' ? /^[1-9]\d*:(0|[1-9]\d*)$/ : /^[1-9]\d*$/;
          if (!pattern.test(identifier ?? '')) throw new NotFoundException();
          const [id, offset = 0] = identifier.split(':').map(Number);
          if (!Number.isSafeInteger(id) || !Number.isSafeInteger(offset)) throw new NotFoundException();
          const exists =
            kind === 'session'
              ? await this.context.getRepository(WagoCommissioningSession).existsBy({ id })
              : await this.context.getRepository(WagoController).existsBy({ id });
          if (!exists) throw new NotFoundException();
        },
        source: ({ identifier }) =>
          this.sample(`${topic}:${identifier ?? ''}`, interval, () => {
            const [id = 0, offset = 0] = (identifier ?? '').split(':').map(Number);
            return read(id, offset);
          }),
      });
    };
    register('controllers', 10_000, 'resources.update', 'none', () => this.wago.list());
    register('commissioning-sessions', 2_000, 'system.settings.manage', 'none', () => this.commissioning.list(100, 0));
    register('diagnostics', 2_000, 'resources.update', 'controller', (id) => this.diagnostics.get(id));
    register('configuration-baseline', 2_000, 'resources.update', 'controller', (id) =>
      this.wago.getConfigurationBaseline(id),
    );
    register('configuration-revisions', 2_000, 'resources.update', 'revisions', (id, offset) =>
      this.wago.revisionsFor(id, offset),
    );
    register('commissioning-verification', 5_000, 'system.settings.manage', 'session', (id) =>
      this.commissioning.verification(id),
    );
    register('runtime-update', 5_000, 'system.settings.manage', 'controller', (id) => this.managed.status(id));
    register('managed-access', 5_000, 'system.settings.manage', 'session', (id) => this.managed.sessionStatus(id));
    register('network-change', 2_000, 'system.settings.manage', 'controller', (id) => this.network.status(id));
  }
}
