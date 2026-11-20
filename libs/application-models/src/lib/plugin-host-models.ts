import type { ResourceType } from './resource-type';
import type { SupervisionMode } from './resource-supervision';

/**
 * The account fields the plugin SDK exposes. Plugins never see host entities: events, requests and host data
 * queries carry this model. Secrets, tokens and contact data are not part of it.
 */
export interface PluginUserModel {
  id: number;
  username: string;
  /** BCP 47 tag of the user's preferred language. */
  locale: string;
  isDisabled: boolean;
}

/** The resource fields the plugin SDK exposes. */
export interface PluginResourceModel {
  id: number;
  name: string;
  type: ResourceType;
  description: string | null;
  allowTakeOver: boolean;
  maxParallelSessions: number;
  supervisionMode: SupervisionMode;
}
