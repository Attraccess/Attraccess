import type { ResourceType } from './resource-type';
import type { SupervisionMode } from './resource-supervision';

/**
 * The account fields the plugin SDK exposes. Plugins never see host entities: events, requests and host data
 * queries carry this model. Secrets, tokens and contact data are not part of it.
 */
export interface PluginUserModel {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  /** "First Last", or the username when no name is set. Show this to people, not `username`. */
  readonly displayName: string;
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

/** What a plugin needs to show a resource to people: its name and picture. */
export interface PluginResourceDisplayModel {
  id: number;
  name: string;
  /** Host-relative URL of the resource's image (served without authentication), or null when it has none. */
  imageUrl: string | null;
}
