// Shared backend types for the Shelly device registry.

/**
 * Authentication state of a Shelly device as learned from a probe.
 * - `unknown`  — never successfully probed.
 * - `none`     — probe succeeded and the device has no auth enabled.
 * - `required` — probe succeeded and the device requires credentials.
 */
export type AuthState = 'unknown' | 'none' | 'required';

/** A persisted Shelly device record (camelCase view of the DB row). */
export interface ShellyDevice {
  id: number;
  name: string;
  ipAddress: string;
  /** Shelly generation: 1 for Gen1, 2/3/… for Gen2+. Null until first probe. */
  generation: number | null;
  /** Device model string (Gen2+ `model`, Gen1 `type`). Null until first probe. */
  model: string | null;
  authState: AuthState;
  /** ISO timestamp of the last probe attempt, or null if never attempted. */
  lastProbeAt: string | null;
  /** Error message from the last probe attempt, or null if the last probe succeeded. */
  lastProbeError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of probing a device's `GET /shelly` endpoint. */
export interface ProbeResult {
  generation: number;
  model: string | null;
  authState: AuthState;
  /** The raw JSON body returned by the device, for diagnostics. */
  raw: unknown;
}
