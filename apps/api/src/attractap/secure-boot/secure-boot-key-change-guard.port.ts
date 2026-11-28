/**
 * Whether a "Secure this reader" conversion is running. Its digests come from the current keys, so the keys must not
 * be replaced or restored under it. Implemented by the conversion side (secure-conversion), which depends on this
 * module, not the other way round.
 */
export interface SecureBootKeyChangeGuard {
  conversionActive(): Promise<boolean>;
}

export const SECURE_BOOT_KEY_CHANGE_GUARD = Symbol.for('attraccess.attractap.secure-boot-key-change-guard');
