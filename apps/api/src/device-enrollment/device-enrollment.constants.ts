export const ENROLLMENT_CODE_ROTATION_MS = 30_000;
export const ENROLLMENT_REQUEST_TTL_MS = 10 * 60_000;

export const ENROLLMENT_CONNECTION_ATTEMPTS = { limit: 3, windowMs: 60_000 };
export const ENROLLMENT_ADDRESS_ATTEMPTS = { limit: 10, windowMs: 10 * 60_000 };
export const ENROLLMENT_MAX_PENDING_PER_ADDRESS = 20;
export const ENROLLMENT_MAX_PENDING_TOTAL = 200;
export const ENROLLMENT_APPROVER_WRONG_CODES = { limit: 5, windowMs: 60_000 };

/** Device types that enroll with a code. Companions join in ATT-1169. */
export const DEVICE_KINDS = ['reader'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
