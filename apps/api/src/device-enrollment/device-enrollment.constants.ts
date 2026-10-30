export const ENROLLMENT_CODE_ROTATION_MS = 30_000;
export const ENROLLMENT_REQUEST_TTL_MS = 10 * 60_000;
/**
 * A Lite reader keeps drawing its last pattern until 10 s after its next rotation was due (firmware
 * LedPattern::STALE_GRACE_MS), e.g. when its connection stalled unnoticed. Its patterns are not handed
 * to another reader before then (plus 5 s for a late message), so the ring can never match someone
 * else's list entry.
 */
export const ENROLLMENT_PATTERN_COOLDOWN_MS = ENROLLMENT_CODE_ROTATION_MS + 10_000 + 5_000;

export const ENROLLMENT_CONNECTION_ATTEMPTS = { limit: 3, windowMs: 60_000 };
export const ENROLLMENT_ADDRESS_ATTEMPTS = { limit: 10, windowMs: 10 * 60_000 };
export const ENROLLMENT_MAX_PENDING_PER_ADDRESS = 20;
export const ENROLLMENT_MAX_PENDING_TOTAL = 200;
export const ENROLLMENT_APPROVER_WRONG_CODES = { limit: 5, windowMs: 60_000 };
