import type { PluginContext } from '@attraccess/plugins-backend-sdk';

// The host hands each plugin its PluginContext under this token. Recreated locally (not imported) so the artifact has
// no runtime dependency on the SDK: Symbol.for() resolves against the process-global registry.
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

export type { PluginContext };

/** Source of the current time, replaceable in tests. */
export const STATUS_WALL_CLOCK = Symbol('status-wall.clock');
export type Clock = () => Date;
