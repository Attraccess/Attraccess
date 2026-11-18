/**
 * Lowest eFuse SECURE_VERSION a secured reader may report. Equal to apps/attractap/firmware/secure-version-floor.txt
 * (a spec test asserts it); raise both together, never lower.
 */
export const SECURE_VERSION_FLOOR = 1;

export interface EfuseKey {
  purpose: string;
  used: boolean;
  readProtected: boolean;
}

/** What a secure-profile reader reports about its eFuses. The reader's word; DS is not attestation. */
export interface EfuseReport {
  mac: string;
  secureBootEn: boolean;
  keys: EfuseKey[];
  digest0: string | null;
  digest1: string | null;
  revoke: boolean[];
  cryptCnt: number;
  cryptCntWriteProtected: boolean;
  disDownloadManualEncrypt: boolean;
  jtag: { padDisabled: boolean; usbDisabled: boolean; softDisJtag: number };
  download: {
    disDownloadMode: boolean;
    enableSecurityDownload: boolean;
    disForceDownload: boolean;
    disUsbSerialJtagDownload: boolean;
  };
  rdDis: number;
  rdDisWriteProtected: boolean;
  secureVersion: number;
  flashEncryptionMode: 'disabled' | 'development' | 'release';
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v);

/** Strictly shaped or null: anything off is a protocol violation, never half-trusted. */
export function parseEfuseReport(body: unknown): EfuseReport | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const keys = b['keys'];
  const revoke = b['revoke'];
  const jtag = b['jtag'] as Record<string, unknown> | undefined;
  const download = b['download'] as Record<string, unknown> | undefined;
  const mode = b['flashEncryptionMode'];
  if (typeof b['mac'] !== 'string' || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(b['mac'])) return null;
  if (!Array.isArray(keys) || keys.length !== 6) return null;
  if (!Array.isArray(revoke) || revoke.length !== 3 || !revoke.every(isBool)) return null;
  if (!jtag || !download) return null;
  for (const key of keys as Array<Record<string, unknown>>) {
    if (!key || typeof key['purpose'] !== 'string' || key['purpose'].length > 48) return null;
    if (!isBool(key['used']) || !isBool(key['readProtected'])) return null;
  }
  const digest0 = b['digest0'] ?? null;
  const digest1 = b['digest1'] ?? null;
  const valid =
    isBool(b['secureBootEn']) &&
    (digest0 === null || isHex64(digest0)) &&
    (digest1 === null || isHex64(digest1)) &&
    isInt(b['cryptCnt'], 7) &&
    isBool(b['cryptCntWriteProtected']) &&
    isBool(b['disDownloadManualEncrypt']) &&
    isBool(jtag['padDisabled']) &&
    isBool(jtag['usbDisabled']) &&
    isInt(jtag['softDisJtag'], 0xff) &&
    isBool(download['disDownloadMode']) &&
    isBool(download['enableSecurityDownload']) &&
    isBool(download['disForceDownload']) &&
    isBool(download['disUsbSerialJtagDownload']) &&
    isInt(b['rdDis'], 0x7f) &&
    isBool(b['rdDisWriteProtected']) &&
    isInt(b['secureVersion'], 0xffff) &&
    (mode === 'disabled' || mode === 'development' || mode === 'release');
  if (!valid) return null;
  return {
    mac: (b['mac'] as string).toLowerCase(),
    secureBootEn: b['secureBootEn'] as boolean,
    keys: (keys as Array<Record<string, unknown>>).map((k) => ({
      purpose: k['purpose'] as string,
      used: k['used'] as boolean,
      readProtected: k['readProtected'] as boolean,
    })),
    digest0: digest0 as string | null,
    digest1: digest1 as string | null,
    revoke: revoke as boolean[],
    cryptCnt: b['cryptCnt'] as number,
    cryptCntWriteProtected: b['cryptCntWriteProtected'] as boolean,
    disDownloadManualEncrypt: b['disDownloadManualEncrypt'] as boolean,
    jtag: jtag as EfuseReport['jtag'],
    download: download as EfuseReport['download'],
    rdDis: b['rdDis'] as number,
    rdDisWriteProtected: b['rdDisWriteProtected'] as boolean,
    secureVersion: b['secureVersion'] as number,
    flashEncryptionMode: mode as EfuseReport['flashEncryptionMode'],
  };
}

export interface RecordedDigests {
  digest0: string | null;
  digest1: string | null;
}

const popcount = (n: number) => n.toString(2).split('1').length - 1;

/** Problem codes for everything in the report that does not match the release secure profile. Empty: it matches. */
export function checkEfuseReport(
  report: EfuseReport,
  recorded: RecordedDigests,
  floor = SECURE_VERSION_FLOOR,
): string[] {
  const problems: string[] = [];
  const key = (index: number) => report.keys[index];
  const same = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

  if (!report.secureBootEn) problems.push('secure-boot-disabled');
  if (key(0).purpose !== 'SECURE_BOOT_DIGEST0') problems.push('key0-purpose');
  if (key(1).purpose !== 'SECURE_BOOT_DIGEST1') problems.push('key1-purpose');
  if (recorded.digest0 === null) problems.push('digest0-not-recorded');
  else if (!same(report.digest0, recorded.digest0)) problems.push('digest0-mismatch');
  if (recorded.digest1 === null) problems.push('digest1-not-recorded');
  else if (!same(report.digest1, recorded.digest1)) problems.push('digest1-mismatch');
  if (report.revoke[0] || report.revoke[1]) problems.push('signing-key-revoked');
  if (!report.revoke[2]) problems.push('slot2-not-revoked');

  const encryptionOn = popcount(report.cryptCnt) % 2 === 1;
  if (!encryptionOn || report.flashEncryptionMode !== 'release') problems.push('flash-encryption-not-release');
  else if (report.cryptCnt !== 7 && !report.cryptCntWriteProtected) problems.push('flash-encryption-not-final');
  if (!report.disDownloadManualEncrypt) problems.push('manual-encrypt-enabled');

  if (key(2).purpose !== 'XTS_AES_128_KEY' || !key(2).used) problems.push('key2-not-xts');
  if (key(3).purpose !== 'HMAC_DOWN_DIGITAL_SIGNATURE' || !key(3).used) problems.push('key3-not-ds');
  if (key(4).purpose !== 'HMAC_UP' || !key(4).used) problems.push('key4-not-nvs-hmac');
  const covered = [2, 3, 4].every((index) => (report.rdDis & (1 << index)) !== 0 && key(index).readProtected);
  if (!covered) problems.push('rd-dis-incomplete');
  if (!report.rdDisWriteProtected) problems.push('rd-dis-writable');

  if (!report.jtag.padDisabled || !report.jtag.usbDisabled) problems.push('jtag-enabled');
  if (!report.download.enableSecurityDownload && !report.download.disDownloadMode) problems.push('rom-download-open');
  if (report.secureVersion < floor) problems.push('secure-version-below-floor');
  return problems;
}
