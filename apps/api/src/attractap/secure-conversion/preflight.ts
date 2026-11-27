import type { AttractapPreflightCheckResult } from '@attraccess/application-models';
import type { PreflightReport } from './conversion-messages';

/** What the reader is converted to: compared against its preflight report. */
export interface PreflightExpectation {
  chip: string;
  variant: string;
  partitionTableSha256: string;
  /** Digests the conversion will burn: KEY0/KEY1 may already hold exactly these (a retry after the burn). */
  digest0: string;
  digest1: string;
}

export const REQUIRED_FLASH_BYTES = 16 * 1024 * 1024;
/** Internal heap the plain app needs for the transfer and the RSA verify (secure build budget plus margin). */
export const MIN_FREE_HEAP = 40_000;
export const MIN_LARGEST_BLOCK = 16_000;

const popcount = (n: number) => n.toString(2).split('1').length - 1;
const result = (check: AttractapPreflightCheckResult['check'], ok: boolean, value: string | null = null) => ({
  check,
  ok,
  value,
});

/**
 * KEY0..KEY5 must be unused and unprotected, so the bootloader and the secure app find free blocks for the flash
 * encryption and NVS keys. Only KEY0/KEY1 may already carry this conversion's digests (burned by an earlier attempt);
 * the reader reports purpose and protection only, never key contents (digests are public).
 */
function keyBlocksFree(report: PreflightReport): boolean {
  return report.keys.every((key, index) => {
    const free = key.purpose === 'USER' && !key.used && !key.readProtected && !key.writeProtected;
    if (free) return true;
    const digestPurpose = index === 0 ? 'SECURE_BOOT_DIGEST0' : index === 1 ? 'SECURE_BOOT_DIGEST1' : null;
    return digestPurpose !== null && key.purpose === digestPurpose && !key.readProtected;
  });
}

/** Server-side verdict over a reader's read-only preflight report. All checks must pass before anything is written. */
export function evaluatePreflight(
  report: PreflightReport,
  expected: PreflightExpectation,
): AttractapPreflightCheckResult[] {
  const mb = Math.round(report.flashSize / (1024 * 1024));
  const encryptionOn = popcount(report.cryptCnt) % 2 === 1;
  const revision = `v${Math.floor(report.chipRevision / 100)}.${report.chipRevision % 100}`;
  return [
    result('chip', report.chip === expected.chip, `${report.chip} ${revision}`),
    result('flash-size', report.flashSize === REQUIRED_FLASH_BYTES, `${mb} MB`),
    result('partition-table', report.partitionTableSha256 === expected.partitionTableSha256.toLowerCase()),
    result('mac', true, report.mac),
    result('key-blocks', keyBlocksFree(report)),
    result('secure-boot-off', !report.secureBootEn),
    result('flash-encryption-off', !encryptionOn),
    result('manual-encrypt', !report.disDownloadManualEncrypt),
    result(
      'heap',
      report.heapFree >= MIN_FREE_HEAP && report.heapLargest >= MIN_LARGEST_BLOCK,
      `${Math.floor(report.heapFree / 1024)} KB / ${Math.floor(report.heapLargest / 1024)} KB`,
    ),
    result('variant', report.variant === expected.variant, report.variant),
    result('profile', report.profile === 'plain', report.profile),
  ];
}

export const preflightPassed = (checks: AttractapPreflightCheckResult[]) => checks.every((check) => check.ok);

/** The MAC the preflight reported; the burn command names it. */
export const preflightMac = (checks: AttractapPreflightCheckResult[] | null): string | null =>
  checks?.find((check) => check.check === 'mac')?.value ?? null;
