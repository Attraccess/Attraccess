import { Inject, Injectable, Logger } from '@nestjs/common';
import { NETWORK_RESTRICTED_ACTIONS, NetworkRestrictedAction } from '@attraccess/application-models';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictedException } from './network-restricted.exception';
import { resolveNetworkOrigin, OriginRequest } from './network-origin';
import { NETWORK_RESTRICTION_STORE, NetworkRestrictionStore } from './network-restriction.port';
import type { NetworkRestrictionConfig } from './network-restriction.config';

export interface NetworkCaller {
  user: { id: number; locale?: string | null };
}

export interface NetworkStatus {
  enabled: boolean;
  insideAllowedNetwork: boolean;
  allowedFromHere: NetworkRestrictedAction[];
}

/** Decides whether the caller's network origin allows a restricted resource action. */
@Injectable()
export class NetworkRestrictionService {
  private readonly logger = new Logger(NetworkRestrictionService.name);

  constructor(
    private readonly config: NetworkRestrictionConfigService,
    @Inject(NETWORK_RESTRICTION_STORE) private readonly store: NetworkRestrictionStore,
  ) {}

  /** The origin of a request as the restriction sees it, whatever the mode. Null: unknown, which counts as outside. */
  async originOf(request: OriginRequest, config?: NetworkRestrictionConfig): Promise<string | null> {
    return resolveNetworkOrigin(request, config ?? (await this.config.get()));
  }

  /** Throws NETWORK_RESTRICTED (403) when the caller is outside the allowed network and no role allows the action. */
  async assertAllowed(
    request: OriginRequest & NetworkCaller,
    action: NetworkRestrictedAction,
    resourceId?: number,
  ): Promise<void> {
    const config = await this.config.get();
    if (!config.enabled) return;
    const address = resolveNetworkOrigin(request, config);
    if (this.config.isInside(config, address)) return;
    if ((await this.store.actionsAllowedForUser(request.user.id)).includes(action)) return;
    this.logger.warn(
      `Blocked ${action} for user ${request.user.id}` +
        `${resourceId === undefined ? '' : ` on resource ${resourceId}`} from ${address ?? 'an unknown address'}`,
    );
    throw new NetworkRestrictedException(action, request.user.locale);
  }

  /** What the caller may do from where they are now. Never reveals the configuration. */
  async statusOf(request: OriginRequest & NetworkCaller): Promise<NetworkStatus> {
    const config = await this.config.get();
    if (!config.enabled) {
      return { enabled: false, insideAllowedNetwork: true, allowedFromHere: [...NETWORK_RESTRICTED_ACTIONS] };
    }
    const inside = this.config.isInside(config, resolveNetworkOrigin(request, config));
    return {
      enabled: true,
      insideAllowedNetwork: inside,
      allowedFromHere: inside
        ? [...NETWORK_RESTRICTED_ACTIONS]
        : await this.store.actionsAllowedForUser(request.user.id),
    };
  }
}
