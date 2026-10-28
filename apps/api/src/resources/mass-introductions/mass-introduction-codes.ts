import { generateSecret, generateSync, verifySync } from 'otplib';

/**
 * Rotating join codes for mass introductions (ATT-1151): standard TOTP (RFC 6238, via otplib, as for
 * two-factor authentication) with a short period. The QR code only names the session; participants
 * type the code shown next to it, so a photo passed on to people who are not in the room is useless.
 */
export const MASS_INTRODUCTION_CODE_PERIOD_SECONDS = 15;

export const MASS_INTRODUCTION_CODE_DIGITS = 6;

const TOTP_OPTIONS = { period: MASS_INTRODUCTION_CODE_PERIOD_SECONDS, digits: MASS_INTRODUCTION_CODE_DIGITS } as const;

export function newMassIntroductionCodeSecret(): string {
  return generateSecret();
}

export function currentMassIntroductionCode(secret: string, nowMs = Date.now()): { code: string; refreshAt: Date } {
  const epoch = Math.floor(nowMs / 1000);
  const periodStart = epoch - (epoch % MASS_INTRODUCTION_CODE_PERIOD_SECONDS);
  return {
    code: generateSync({ ...TOTP_OPTIONS, secret, epoch }),
    refreshAt: new Date((periodStart + MASS_INTRODUCTION_CODE_PERIOD_SECONDS) * 1000),
  };
}

/** Accepts the current and the previous code, so typing it just before it changes still works. */
export function isValidMassIntroductionCode(secret: string, code: string, nowMs = Date.now()): boolean {
  if (code.length !== MASS_INTRODUCTION_CODE_DIGITS || !/^\d+$/.test(code)) {
    return false;
  }
  const result = verifySync({
    ...TOTP_OPTIONS,
    secret,
    token: code,
    epoch: Math.floor(nowMs / 1000),
    epochTolerance: [MASS_INTRODUCTION_CODE_PERIOD_SECONDS, 0],
  });
  return result.valid;
}
