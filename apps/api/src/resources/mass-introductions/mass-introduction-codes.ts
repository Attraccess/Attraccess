import { generateSecret, generateSync, verifySync } from 'otplib';

/**
 * Rotating QR codes for mass introductions (ATT-1151): standard TOTP (RFC 6238, via otplib, as for
 * two-factor authentication) with a short period, so a photo of the QR code stops working before it
 * can be passed on to people who are not in the room.
 */
export const MASS_INTRODUCTION_CODE_PERIOD_SECONDS = 15;

const TOTP_OPTIONS = { period: MASS_INTRODUCTION_CODE_PERIOD_SECONDS, digits: 8 } as const;

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

/** Accepts the current and the previous code, so a scan just before the QR code changes still works. */
export function isValidMassIntroductionCode(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{8}$/.test(code)) {
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
