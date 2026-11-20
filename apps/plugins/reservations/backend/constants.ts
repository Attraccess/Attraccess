// The host publishes the PluginContext under this process-global symbol (recreated locally so the
// bundle has no runtime dependency on the SDK).
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/** Injection tokens (`Symbol.for`, so every module of the plugin bundle resolves the same token). */
export const RESERVATION_NOTIFIER = Symbol.for('attraccess.reservations.notifier');
export const RESERVATION_CLOCK = Symbol.for('attraccess.reservations.clock');

/** A booking shows as "Free until" on a reader this long before it starts. */
export const READER_HORIZON_MS = 24 * 60 * 60_000;

export type Clock = () => Date;

/** Cancel reason of bookings removed because the machine lost slots (shown in audit and mails). */
export const CAPACITY_REDUCED_REASON = 'machine capacity reduced';
