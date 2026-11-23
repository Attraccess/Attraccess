/**
 * Reader -> server messages of the secure conversion (CONTROL frames, field `t`). Every parser is strict: anything
 * off is a protocol violation and never half-trusted. What the reader reports is its word, not attestation.
 */

export const CONVERSION_STAGES = [
  'none',
  'transferring',
  'verified',
  'burned',
  'bootloader-written',
  'migrated',
  'migration-failed',
] as const;
export type ConversionStage = (typeof CONVERSION_STAGES)[number];

export const VERIFY_PROBLEMS = [
  'app-signature',
  'bootloader-signature',
  'app-hash',
  'bootloader-hash',
  'variant',
  'profile-marker',
  'secure-version',
  'bootloader-size',
  'staging',
] as const;

export const BURN_REFUSALS = [
  'mac',
  'digests',
  'not-verified',
  'stop-before-burn',
  'key-blocks',
  'efuse-error',
] as const;
export type BurnRefusal = (typeof BURN_REFUSALS)[number];

export interface ConversionStatusMessage {
  t: 'conversion.status';
  id: number | null;
  stage: ConversionStage;
  rdDisLocked: boolean;
}

export interface PreflightKey {
  purpose: string;
  used: boolean;
  readProtected: boolean;
  writeProtected: boolean;
}

export interface PreflightReport {
  t: 'conversion.preflight-report';
  id: number;
  chip: string;
  chipRevision: number;
  flashSize: number;
  mac: string;
  partitionTableSha256: string;
  keys: PreflightKey[];
  secureBootEn: boolean;
  cryptCnt: number;
  disDownloadManualEncrypt: boolean;
  jtag: { padDisabled: boolean; usbDisabled: boolean };
  heapFree: number;
  heapLargest: number;
  variant: string;
  version: string;
  profile: string;
}

export interface VerifiedMessage {
  t: 'conversion.verified';
  id: number;
  ok: boolean;
  problems: string[];
}

export interface BurnedMessage {
  t: 'conversion.burned';
  id: number;
  mac: string;
  digest0: string;
  digest1: string;
  key0Purpose: string;
  key1Purpose: string;
}

export interface BurnRefusedMessage {
  t: 'conversion.burn-refused';
  id: number;
  reason: BurnRefusal;
}

export interface BootloaderWrittenMessage {
  t: 'conversion.bootloader-written';
  id: number;
  ok: boolean;
  sha256: string | null;
}

export type ConversionMessage =
  | ConversionStatusMessage
  | PreflightReport
  | VerifiedMessage
  | BurnedMessage
  | BurnRefusedMessage
  | BootloaderWrittenMessage;

export const CONVERSION_MESSAGE_TYPES = [
  'conversion.status',
  'conversion.preflight-report',
  'conversion.verified',
  'conversion.burned',
  'conversion.burn-refused',
  'conversion.bootloader-written',
] as const;

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);
const isMac = (v: unknown): v is string => typeof v === 'string' && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(v);
const isShort = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length <= max;
const MAX_ID = 2 ** 31 - 1;
const isId = (v: unknown): v is number => isInt(v, MAX_ID);

function parseStatus(body: Obj): ConversionStatusMessage | null {
  const id = body['id'] ?? null;
  const stage = body['stage'];
  if (id !== null && !isId(id)) return null;
  if (!CONVERSION_STAGES.includes(stage as ConversionStage)) return null;
  const rdDisLocked = body['rdDisLocked'] ?? false;
  if (!isBool(rdDisLocked)) return null;
  return { t: 'conversion.status', id: id as number | null, stage: stage as ConversionStage, rdDisLocked };
}

function parseKeys(keys: unknown): PreflightKey[] | null {
  if (!Array.isArray(keys) || keys.length !== 6) return null;
  const parsed: PreflightKey[] = [];
  for (const key of keys as unknown[]) {
    if (!isObject(key) || !isShort(key['purpose'], 48)) return null;
    const flags = ['used', 'readProtected', 'writeProtected'] as const;
    if (!flags.every((flag) => isBool(key[flag]))) return null;
    parsed.push({
      purpose: key['purpose'] as string,
      used: key['used'] as boolean,
      readProtected: key['readProtected'] as boolean,
      writeProtected: key['writeProtected'] as boolean,
    });
  }
  return parsed;
}

function parsePreflight(body: Obj): PreflightReport | null {
  const keys = parseKeys(body['keys']);
  const jtag = body['jtag'];
  const valid =
    isId(body['id']) &&
    isShort(body['chip'], 16) &&
    isInt(body['chipRevision'], 9999) &&
    isInt(body['flashSize'], 2 ** 31) &&
    isMac(body['mac']) &&
    isHex64(body['partitionTableSha256']) &&
    isBool(body['secureBootEn']) &&
    isInt(body['cryptCnt'], 7) &&
    isBool(body['disDownloadManualEncrypt']) &&
    isObject(jtag) &&
    isBool(jtag['padDisabled']) &&
    isBool(jtag['usbDisabled']) &&
    isInt(body['heapFree'], 2 ** 31) &&
    isInt(body['heapLargest'], 2 ** 31) &&
    isShort(body['variant']) &&
    isShort(body['version'], 32) &&
    isShort(body['profile'], 16);
  if (!valid || !keys) return null;
  const j = jtag as Obj;
  return {
    t: 'conversion.preflight-report',
    id: body['id'] as number,
    chip: body['chip'] as string,
    chipRevision: body['chipRevision'] as number,
    flashSize: body['flashSize'] as number,
    mac: (body['mac'] as string).toLowerCase(),
    partitionTableSha256: (body['partitionTableSha256'] as string).toLowerCase(),
    keys,
    secureBootEn: body['secureBootEn'] as boolean,
    cryptCnt: body['cryptCnt'] as number,
    disDownloadManualEncrypt: body['disDownloadManualEncrypt'] as boolean,
    jtag: { padDisabled: j['padDisabled'] as boolean, usbDisabled: j['usbDisabled'] as boolean },
    heapFree: body['heapFree'] as number,
    heapLargest: body['heapLargest'] as number,
    variant: body['variant'] as string,
    version: body['version'] as string,
    profile: body['profile'] as string,
  };
}

function parseVerified(body: Obj): VerifiedMessage | null {
  const problems = body['problems'] ?? [];
  if (
    !isId(body['id']) ||
    !isBool(body['ok']) ||
    !Array.isArray(problems) ||
    problems.length > VERIFY_PROBLEMS.length
  ) {
    return null;
  }
  if (!problems.every((p) => VERIFY_PROBLEMS.includes(p as (typeof VERIFY_PROBLEMS)[number]))) return null;
  return { t: 'conversion.verified', id: body['id'], ok: body['ok'], problems: problems as string[] };
}

function parseBurned(body: Obj): BurnedMessage | null {
  const valid =
    isId(body['id']) &&
    isMac(body['mac']) &&
    isHex64(body['digest0']) &&
    isHex64(body['digest1']) &&
    isShort(body['key0Purpose'], 48) &&
    isShort(body['key1Purpose'], 48);
  if (!valid) return null;
  return {
    t: 'conversion.burned',
    id: body['id'] as number,
    mac: (body['mac'] as string).toLowerCase(),
    digest0: (body['digest0'] as string).toLowerCase(),
    digest1: (body['digest1'] as string).toLowerCase(),
    key0Purpose: body['key0Purpose'] as string,
    key1Purpose: body['key1Purpose'] as string,
  };
}

function parseBurnRefused(body: Obj): BurnRefusedMessage | null {
  if (!isId(body['id']) || !BURN_REFUSALS.includes(body['reason'] as BurnRefusal)) return null;
  return { t: 'conversion.burn-refused', id: body['id'], reason: body['reason'] as BurnRefusal };
}

function parseBootloaderWritten(body: Obj): BootloaderWrittenMessage | null {
  const sha = body['sha256'] ?? null;
  if (!isId(body['id']) || !isBool(body['ok']) || (sha !== null && !isHex64(sha))) return null;
  return {
    t: 'conversion.bootloader-written',
    id: body['id'],
    ok: body['ok'],
    sha256: sha === null ? null : (sha as string).toLowerCase(),
  };
}

const PARSERS: Record<(typeof CONVERSION_MESSAGE_TYPES)[number], (body: Obj) => ConversionMessage | null> = {
  'conversion.status': parseStatus,
  'conversion.preflight-report': parsePreflight,
  'conversion.verified': parseVerified,
  'conversion.burned': parseBurned,
  'conversion.burn-refused': parseBurnRefused,
  'conversion.bootloader-written': parseBootloaderWritten,
};

/** Null for anything that is not a well-formed conversion message. */
export function parseConversionMessage(body: unknown): ConversionMessage | null {
  if (!isObject(body)) return null;
  const parser = PARSERS[body['t'] as keyof typeof PARSERS];
  return parser ? parser(body) : null;
}
