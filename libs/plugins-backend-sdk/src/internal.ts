/**
 * Host-internal building blocks shared by the API host and the SDK fake. This entry is reachable only through the
 * workspace path alias `@attraccess/plugins-backend-sdk/internal`; it is not part of the published package
 * exports, so plugins cannot import it. Plugins use `context.ble` instead.
 */
export {
  BleSessionEngine,
  type BleSessionClock,
  type BleSessionEngineDeps,
  type BleSessionLink,
} from './lib/plugin-ble-session-engine';
