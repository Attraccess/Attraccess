import type { ResourceType } from './resource-type';

/** The resource types and actions a plugin reader may serve, as the plugin registered them. */
export interface PluginReaderCapabilitiesRecord {
  resourceTypes: string[];
  actions: string[];
}

/** A card reader a backend plugin owns, registered through `context.readers`. */
export interface PluginReaderRecord {
  id: number;
  pluginId: string;
  /** Plugin-chosen id of the device, unique per plugin. */
  deviceId: string;
  name: string;
  capabilities: PluginReaderCapabilitiesRecord;
  resourceId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPluginReader = Pick<PluginReaderRecord, 'pluginId' | 'deviceId' | 'name' | 'capabilities'>;

/** The reader fields the host changes; the plugin and device never change. */
export type PluginReaderRecordChanges = Partial<Pick<PluginReaderRecord, 'name' | 'capabilities' | 'resourceId'>>;

/** What a plugin reader needs to know of a resource: which actions it allows. */
export interface PluginReaderResource {
  id: number;
  name: string;
  type: ResourceType;
  separateUnlockAndUnlatch: boolean | null;
  accessOnly: boolean;
}

/** The owner of a card tapped on a plugin reader; a deleted user is never one. */
export interface PluginReaderCardOwner {
  id: number;
  username: string;
  isDisabled: boolean;
}
