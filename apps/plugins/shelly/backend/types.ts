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

/** Result of probing a device's `GET /shelly` endpoint. */
export interface ProbeResult {
  generation: number;
  model: string | null;
  authState: AuthState;
  /** The raw JSON body returned by the device, for diagnostics. */
  raw: unknown;
}
