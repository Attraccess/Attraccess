import type {
  NewPluginReader,
  PluginReaderCardOwner,
  PluginReaderRecord,
  PluginReaderRecordChanges,
  PluginReaderResource,
} from '@attraccess/application-models';

/**
 * Persistence of plugin readers (`context.readers`): the readers each plugin registers and their assigned resource,
 * plus the resource and card owner lookups of an assignment and a tap. A reader's resource is unassigned by the
 * store when the resource is deleted.
 */
export interface PluginReaderStore {
  find(pluginId: string, deviceId: string): Promise<PluginReaderRecord | null>;
  /** The plugin's readers, in registration order. */
  list(pluginId: string): Promise<PluginReaderRecord[]>;
  count(pluginId: string): Promise<number>;
  /** Stores a reader without a resource and returns it as stored. */
  create(reader: NewPluginReader): Promise<PluginReaderRecord>;
  /** Applies the changes and returns the reader as stored. */
  update(id: number, changes: PluginReaderRecordChanges): Promise<PluginReaderRecord>;
  delete(pluginId: string, deviceId: string): Promise<void>;
  deleteAllOfPlugin(pluginId: string): Promise<void>;

  /** The resource, or null when it does not exist or was deleted. */
  findResource(resourceId: number): Promise<PluginReaderResource | null>;
  /** The user, or null when the account does not exist or was deleted. */
  findCardOwner(userId: number): Promise<PluginReaderCardOwner | null>;
  /** Whether the card still exists, is active and belongs to the user. */
  isActiveCardOf(cardId: number, userId: number): Promise<boolean>;
}

export const PLUGIN_READER_STORE = Symbol.for('attraccess.plugin-system.reader-store');
