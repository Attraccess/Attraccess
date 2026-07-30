// Shared backend types for the Shelly device registry.

/**
 * Authentication state of a Shelly device as learned from a probe.
 * - `unknown`  — never successfully probed.
 * - `none`     — probe succeeded and the device has no auth enabled.
 * - `required` — probe succeeded and the device requires credentials.
 */
export type AuthState = 'unknown' | 'none' | 'required';

// The persisted device record is the `ShellyDevice` TypeORM entity
// (backend/shelly-device.entity.ts) — a real ORM entity rather than a hand-rolled
// row interface. Import it from there.

/**
 * How Attraccess reaches a device.
 * - `wifi-mqtt` — HTTP RPC plus the device's own MQTT client (ATT-499).
 * - `zigbee`    — paired into zigbee2mqtt; control and state go through the
 *                 gateway. The device keeps its WiFi/RPC endpoint (Gen4 is
 *                 dual-stack), which is what we use to drive pairing.
 */
export type DeviceTransport = 'wifi-mqtt' | 'zigbee';

/** Result of probing a device's `GET /shelly` endpoint. */
export interface ProbeResult {
  generation: number;
  model: string | null;
  authState: AuthState;
  /**
   * Zigbee capability, or null when it was not determined (Gen1 devices, or a
   * probe that could not reach the RPC endpoint). Present means the device
   * answered `Zigbee.GetConfig`.
   */
  zigbee: ZigbeeCapability | null;
  /** The raw JSON body returned by the device, for diagnostics. */
  raw: unknown;
}

/** What a device reports about its own Zigbee radio over HTTP RPC. */
export interface ZigbeeCapability {
  /** The device exposes the `Zigbee.*` RPC surface at all. */
  capable: boolean;
  /** `Zigbee.GetConfig.enable` — the radio is switched on. */
  enabled: boolean;
  /**
   * `Zigbee.GetStatus.network_state`, or null if the status call failed.
   * One of `disabled` | `initializing` | `steering` | `joined` | `failed`.
   */
  networkState: ZigbeeNetworkState | null;
}

export type ZigbeeNetworkState = 'disabled' | 'initializing' | 'steering' | 'joined' | 'failed';
