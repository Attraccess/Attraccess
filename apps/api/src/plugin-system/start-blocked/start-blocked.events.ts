/** Emitted on the host event bus when a plugin reports that its start-blocked answer may have changed. */
export const PLUGIN_START_BLOCKED_CHANGED_EVENT = 'plugin.start-blocked.changed';

export interface PluginStartBlockedChanged {
  pluginName: string;
  resourceId: number;
}

/** Live event type resource pages react to by asking the start-blocked query again. */
export const START_BLOCKED_LIVE_EVENT_TYPE = 'resource.start_blocked_changed';
