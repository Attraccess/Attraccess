// The host publishes the PluginContext under this process-global symbol (recreated locally so the
// bundle has no runtime dependency on the SDK).
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/** Injection tokens (`Symbol.for`, so every module of the plugin bundle resolves the same token). */
export const RESERVATION_NOTIFIER = Symbol.for('attraccess.reservations.notifier');
export const RESERVATION_CLOCK = Symbol.for('attraccess.reservations.clock');

export type Clock = () => Date;
