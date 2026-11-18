import { ATTRACTAP_SECURITY_PROBLEMS_MORE, type AttractapSecurityProblem } from '@attraccess/application-models';

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

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => !!v && typeof v === 'object';

function parseKeys(keys: unknown): EfuseKey[] | null {
  if (!Array.isArray(keys) || keys.length !== 6) return null;
  const parsed: EfuseKey[] = [];
  for (const key of keys as unknown[]) {
    if (!isObject(key) || typeof key['purpose'] !== 'string' || key['purpose'].length > 48) return null;
    if (!isBool(key['used']) || !isBool(key['readProtected'])) return null;
    parsed.push({ purpose: key['purpose'], used: key['used'], readProtected: key['readProtected'] });
  }
  return parsed;
}

function parseJtag(jtag: unknown): EfuseReport['jtag'] | null {
  if (!isObject(jtag)) return null;
  if (!isBool(jtag['padDisabled']) || !isBool(jtag['usbDisabled']) || !isInt(jtag['softDisJtag'], 0xff)) return null;
  return jtag as unknown as EfuseReport['jtag'];
}

function parseDownload(download: unknown): EfuseReport['download'] | null {
  if (!isObject(download)) return null;
  const flags = ['disDownloadMode', 'enableSecurityDownload', 'disForceDownload', 'disUsbSerialJtagDownload'];
  return flags.every((flag) => isBool(download[flag])) ? (download as unknown as EfuseReport['download']) : null;
}

function parseDigest(value: unknown): string | null | undefined {
  const digest = value ?? null;
  if (digest === null) return null;
  return isHex64(digest) ? digest : undefined;
}

/** Strictly shaped or null: anything off is a protocol violation, never half-trusted. */
export function parseEfuseReport(body: unknown): EfuseReport | null {
  if (!isObject(body)) return null;
  const mode = body['flashEncryptionMode'];
  const revoke = body['revoke'];
  const keys = parseKeys(body['keys']);
  const jtag = parseJtag(body['jtag']);
  const download = parseDownload(body['download']);
  const digest0 = parseDigest(body['digest0']);
  const digest1 = parseDigest(body['digest1']);
  const scalarsValid =
    typeof body['mac'] === 'string' &&
    /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(body['mac']) &&
    isBool(body['secureBootEn']) &&
    isInt(body['cryptCnt'], 7) &&
    isBool(body['cryptCntWriteProtected']) &&
    isBool(body['disDownloadManualEncrypt']) &&
    isInt(body['rdDis'], 0x7f) &&
    isBool(body['rdDisWriteProtected']) &&
    isInt(body['secureVersion'], 0xffff) &&
    (mode === 'disabled' || mode === 'development' || mode === 'release');
  if (!scalarsValid || !keys || !jtag || !download || digest0 === undefined || digest1 === undefined) return null;
  if (!Array.isArray(revoke) || revoke.length !== 3 || !revoke.every(isBool)) return null;
  return {
    mac: (body['mac'] as string).toLowerCase(),
    secureBootEn: body['secureBootEn'] as boolean,
    keys,
    digest0,
    digest1,
    revoke: revoke as boolean[],
    cryptCnt: body['cryptCnt'] as number,
    cryptCntWriteProtected: body['cryptCntWriteProtected'] as boolean,
    disDownloadManualEncrypt: body['disDownloadManualEncrypt'] as boolean,
    jtag,
    download,
    rdDis: body['rdDis'] as number,
    rdDisWriteProtected: body['rdDisWriteProtected'] as boolean,
    secureVersion: body['secureVersion'] as number,
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
): AttractapSecurityProblem[] {
  const problems: AttractapSecurityProblem[] = [];
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

/** Longest problem list an audit event carries. Every problem code at once fits; the bound is a safeguard only. */
export const AUDIT_PROBLEMS_MAX_LENGTH = 512;

/** Problem codes joined by commas for the audit, cut only between whole codes (then ending in `more`). */
export function auditProblemList(problems: readonly string[], maxLength = AUDIT_PROBLEMS_MAX_LENGTH): string {
  const joined = problems.join(',');
  if (joined.length <= maxLength) return joined;
  const kept: string[] = [];
  let length = ATTRACTAP_SECURITY_PROBLEMS_MORE.length;
  for (const problem of problems) {
    if (length + problem.length + 1 > maxLength) break;
    kept.push(problem);
    length += problem.length + 1;
  }
  return [...kept, ATTRACTAP_SECURITY_PROBLEMS_MORE].join(',');
}
