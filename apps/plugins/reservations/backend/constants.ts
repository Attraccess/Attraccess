// The host publishes the PluginContext under this process-global symbol (recreated locally so the
// bundle has no runtime dependency on the SDK).
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/** Injection tokens (all `Symbol.for`, so part-2 modules can share them). */
export const RESERVATION_NOTIFIER = Symbol.for('attraccess.reservations.notifier');
export const RESERVATION_CLOCK = Symbol.for('attraccess.reservations.clock');

export type Clock = () => Date;
