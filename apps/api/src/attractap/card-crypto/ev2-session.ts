import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AES_BLOCK_SIZE, aesCmac, cbcDecrypt, cbcEncrypt, xor } from './aes';

/**
 * Server-side port of the reader firmware's AuthenticateEV2First / secure
 * messaging code (apps/attractap/firmware/src/rfid/pn532/ntag424/*.cpp).
 *
 * It is deliberately a byte-for-byte port, including firmware quirks (e.g. the
 * high byte of the command counter is zeroed inside the IV). Do not "fix"
 * those here: existing cards and recorded firmware exchanges depend on them.
 * Commands are returned as plain ISO APDUs; the reader only relays them.
 *
 * The server checks more than the firmware did, because the reader relaying
 * the bytes is not trusted. These checks never change bytes on the wire:
 * - the card must return the rotated RndA (proof of key possession);
 * - a success status in MAC/FULL mode must carry a valid response MAC;
 * - any integrity failure or error status ends the session.
 */

export const COMM_MODE = { PLAIN: 0x00, MAC: 0x01, FULL: 0x02 } as const;
export type CommMode = (typeof COMM_MODE)[keyof typeof COMM_MODE];

export const CLA_NATIVE = 0x90;
export const INS_AUTH_EV2_FIRST = 0x71;
export const INS_ADDITIONAL_FRAME = 0xaf;
export const INS_CHANGE_KEY = 0xc4;
export const INS_ISO_UPDATE_BINARY = 0xd6;

/** Status words returned by the card (SW1 SW2). */
export const STATUS_OK = 0x9100;
export const STATUS_ADDITIONAL_FRAME = 0x91af;
export const STATUS_ISO_OK = 0x9000;
/** Native commands answer 91 xx, ISO-wrapped ones 90 00. */
const isSuccess = (cla: number, status: number) =>
  cla === CLA_NATIVE ? status === STATUS_OK || status === STATUS_ADDITIONAL_FRAME : status === STATUS_ISO_OK;

/**
 * Largest command the reader can relay: the PN532 frame buffer is
 * PN532_PACKBUFFSIZ (64) bytes and InDataExchange needs two of them.
 */
export const MAX_RELAYED_COMMAND_LENGTH = 62;

/** Highest key number on the cards we support (DESFire app keys / NTAG 424 has 0-4). */
export const MAX_KEY_NO = 13;

const TI_SIZE = 4;
const BLOCK = AES_BLOCK_SIZE;
const KEY_SIZE = 16;

export class CardProtocolError extends Error {}

/** Firmware ntag424_cmac_short: the odd-indexed bytes (1,3,..,15) of the CMAC. */
export function cmacShort(key: Buffer, input: Buffer): Buffer {
  const full = aesCmac(key, input);
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) out[i] = full[1 + 2 * i];
  return out;
}

/** ISO/IEC 7816-4 style padding as in firmware ntag424_addpadding (always adds 1..16 bytes). */
export function addPadding(data: Buffer): Buffer {
  const zeros = BLOCK - (data.length % BLOCK);
  const out = Buffer.alloc(data.length + zeros);
  data.copy(out);
  out[data.length] = 0x80;
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard reflected CRC-32 (zlib), like esp_rom_crc32_le(0, ...). */
export function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function deriveSessionKeys(key: Buffer, rndA: Buffer, rndB: Buffer): { enc: Buffer; mac: Buffer } {
  const f1 = rndA.subarray(0, 2);
  const f2xor3 = xor(rndA.subarray(2, 8), rndB.subarray(0, 6));
  const f4 = rndB.subarray(6, 16);
  const f5 = rndA.subarray(8, 16);
  const tail = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x80]), f1, f2xor3, f4, f5]);
  const sv1 = Buffer.concat([Buffer.from([0xa5, 0x5a]), tail]);
  const sv2 = Buffer.concat([Buffer.from([0x5a, 0xa5]), tail]);
  return { enc: aesCmac(key, sv1), mac: aesCmac(key, sv2) };
}

function requireKey(key: Buffer, name: string): void {
  if (key.length !== KEY_SIZE) throw new CardProtocolError(`${name} must be ${KEY_SIZE} bytes`);
}

function requireKeyNo(keyNo: number): void {
  if (!Number.isInteger(keyNo) || keyNo < 0 || keyNo > MAX_KEY_NO) throw new CardProtocolError('invalid key number');
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function wipe(...buffers: (Buffer | null)[]): void {
  for (const buffer of buffers) buffer?.fill(0);
}

export interface Ev2Result {
  /** Response payload without MAC and without the 2 byte status trailer. */
  data: Buffer;
  /** Status trailer (SW1 SW2), e.g. 0x9100. */
  status: number;
}

export type ChangeKeyOutcome = 'confirmed' | 'reauthenticate' | 'failed';

type AuthPhase = 'idle' | 'sent-first' | 'sent-second' | 'authenticated';

interface PendingCommand {
  cla: number;
  ins: number;
  mode: CommMode;
  /** For ChangeKey: the key number being changed. */
  changedKeyNo?: number;
}

/**
 * One EV2 secure-messaging session with one card. Every command built by
 * `encodeCommand` must be answered by exactly one `decodeResponse` call before
 * the next command is built; the session refuses anything else.
 */
export class Ev2Session {
  private phase: AuthPhase = 'idle';
  private key: Buffer | null = null;
  private authKeyNo: number | null = null;
  private rndA: Buffer | null = null;
  private rndB: Buffer | null = null;
  private keyEnc: Buffer | null = null;
  private keyMac: Buffer | null = null;
  private ti: Buffer | null = null;
  private counter = 0;
  private pending: PendingCommand | null = null;

  constructor(private readonly random: (size: number) => Buffer = randomBytes) {}

  get authenticated(): boolean {
    return this.phase === 'authenticated';
  }

  /** Key number used by the current authentication, or null. */
  get authenticatedKeyNo(): number | null {
    return this.authenticated ? this.authKeyNo : null;
  }

  /** Native AuthenticateEV2First part 1 (90 71 00 00 05 keyNo 03 00 00 00 00). */
  beginAuthentication(keyNo: number, key: Buffer): Buffer {
    requireKeyNo(keyNo);
    requireKey(key, 'key');
    this.reset();
    this.key = Buffer.from(key);
    this.authKeyNo = keyNo;
    this.phase = 'sent-first';
    return Buffer.from([CLA_NATIVE, INS_AUTH_EV2_FIRST, 0x00, 0x00, 0x05, keyNo, 0x03, 0x00, 0x00, 0x00, 0x00]);
  }

  /** Handle part 1 response (16 byte encrypted RndB + 91AF) and produce part 2. */
  continueAuthentication(response: Buffer): Buffer {
    if (this.phase !== 'sent-first' || !this.key) throw new CardProtocolError('unexpected auth response');
    if (response.length !== 18 || response[16] !== 0x91 || response[17] !== 0xaf) {
      this.reset();
      throw new CardProtocolError('AuthenticateFirst part 1 result error');
    }
    const iv = Buffer.alloc(BLOCK);
    this.rndB = cbcDecrypt(this.key, iv, response.subarray(0, 16));
    const rndA = this.random(BLOCK);
    if (rndA.length !== BLOCK) return this.fail('random source returned the wrong length');
    this.rndA = Buffer.from(rndA);
    const rotated = Buffer.concat([this.rndB.subarray(1), this.rndB.subarray(0, 1)]);
    const answer = cbcEncrypt(this.key, iv, Buffer.concat([this.rndA, rotated]));
    this.phase = 'sent-second';
    return Buffer.concat([
      Buffer.from([CLA_NATIVE, INS_ADDITIONAL_FRAME, 0x00, 0x00, 0x20]),
      answer,
      Buffer.from([0x00]),
    ]);
  }

  /**
   * Handle part 2 response (32 byte encrypted TI|RndA'|caps + 9100).
   *
   * The firmware does not check RndA' (it only checks the status). The server
   * additionally requires the card to prove key possession by returning the
   * rotated RndA; this adds a check and never changes bytes on the wire.
   */
  finishAuthentication(response: Buffer): void {
    if (this.phase !== 'sent-second' || !this.key || !this.rndA || !this.rndB) {
      throw new CardProtocolError('unexpected auth response');
    }
    const key = this.key;
    const rndA = this.rndA;
    const rndB = this.rndB;
    if (response.length !== 34 || response[32] !== 0x91 || response[33] !== 0x00) {
      this.reset();
      throw new CardProtocolError('AuthenticateFirst part 2 result error');
    }
    const plain = cbcDecrypt(key, Buffer.alloc(BLOCK), response.subarray(0, 32));
    const rndARotated = Buffer.concat([rndA.subarray(1), rndA.subarray(0, 1)]);
    if (!sameBytes(plain.subarray(4, 20), rndARotated)) {
      this.reset();
      throw new CardProtocolError('card failed to prove knowledge of the key');
    }
    this.ti = Buffer.from(plain.subarray(0, TI_SIZE));
    this.counter = 0;
    const keys = deriveSessionKeys(key, rndA, rndB);
    this.keyEnc = keys.enc;
    this.keyMac = keys.mac;
    this.phase = 'authenticated';
    // key material is not needed any longer
    wipe(key, rndA, rndB, plain, rndARotated);
    this.key = null;
    this.rndA = null;
    this.rndB = null;
  }

  private counterLe(): Buffer {
    return Buffer.from([this.counter & 0xff, (this.counter >> 8) & 0xff]);
  }

  private requireSession(): { enc: Buffer; mac: Buffer; ti: Buffer } {
    if (!this.authenticated || !this.keyEnc || !this.keyMac || !this.ti)
      throw new CardProtocolError('not authenticated');
    return { enc: this.keyEnc, mac: this.keyMac, ti: this.ti };
  }

  /** Firmware quirk: IV plaintext is prefix | TI | counter low byte | zeros (the counter high byte is zeroed). */
  private ivFor(prefix: [number, number]): Buffer {
    const { enc, ti } = this.requireSession();
    const iv = Buffer.alloc(BLOCK);
    iv[0] = prefix[0];
    iv[1] = prefix[1];
    ti.copy(iv, 2);
    iv[6] = this.counter & 0xff;
    return cbcEncrypt(enc, Buffer.alloc(BLOCK), iv);
  }

  private mac(ins: number, header: Buffer, data: Buffer): Buffer {
    const { mac, ti } = this.requireSession();
    return cmacShort(mac, Buffer.concat([Buffer.from([ins]), this.counterLe(), ti, header, data]));
  }

  /** Mirrors ntag424_apdu_send (command side). The caller must pass the card's reply to decodeResponse. */
  encodeCommand(ins: number, header: Buffer, data: Buffer, mode: CommMode, cla: number = CLA_NATIVE): Buffer {
    return this.encode({ cla, ins, mode }, header, data);
  }

  private encode(pending: PendingCommand, header: Buffer, data: Buffer): Buffer {
    const { cla, ins, mode } = pending;
    const { enc } = this.requireSession();
    if (this.pending) throw new CardProtocolError('previous command has no response yet');
    let body: Buffer;
    if (mode === COMM_MODE.PLAIN) {
      body = Buffer.concat([header, data]);
    } else if (mode === COMM_MODE.MAC) {
      body = Buffer.concat([header, data, this.mac(ins, header, data)]);
    } else if (data.length > 0) {
      const ive = this.ivFor([0xa5, 0x5a]);
      const encrypted = cbcEncrypt(enc, ive, addPadding(data));
      body = Buffer.concat([header, encrypted, this.mac(ins, header, encrypted)]);
    } else {
      body = Buffer.concat([header, this.mac(ins, header, data)]);
    }
    const lc = body.length;
    if (lc > 0xff) throw new CardProtocolError('command too long');
    const apdu = Buffer.concat([Buffer.from([cla, ins, 0x00, 0x00, lc]), body]);
    const framed = ins === INS_ISO_UPDATE_BINARY ? apdu : Buffer.concat([apdu, Buffer.from([0x00])]);
    if (framed.length > MAX_RELAYED_COMMAND_LENGTH) throw new CardProtocolError('command does not fit the reader');
    this.pending = pending;
    return framed;
  }

  /**
   * Mirrors ntag424_decodeResponse for the command built last. `response`
   * includes the 2 byte status trailer.
   *
   * Unlike the firmware, a success status in MAC/FULL mode is only accepted
   * with a valid response MAC: a relaying reader must not be able to forge
   * "91 00". Error statuses are returned without data and end the session,
   * as they do on the card.
   */
  decodeResponse(response: Buffer): Ev2Result {
    const { enc, mac, ti } = this.requireSession();
    const pending = this.pending;
    if (!pending) throw new CardProtocolError('no command is waiting for a response');
    this.pending = null;
    const { cla, mode } = pending;
    this.counter += 1;
    const length = response.length;
    if (length < 2) return this.fail('response too short');
    const status = (response[length - 2] << 8) | response[length - 1];
    const success = isSuccess(cla, status);
    if (mode !== COMM_MODE.PLAIN) {
      if (length < 10) {
        if (success) return this.fail('response MAC missing');
        this.reset();
        return { data: Buffer.alloc(0), status };
      }
      const received = response.subarray(length - 10, length - 2);
      const macInput = Buffer.concat([
        Buffer.from([response[length - 1]]),
        this.counterLe(),
        ti,
        response.subarray(0, length - 10),
      ]);
      if (!sameBytes(cmacShort(mac, macInput), received)) return this.fail('response CMAC integrity error');
    }
    if (!success) {
      this.reset();
      return { data: Buffer.alloc(0), status };
    }
    if (length > 10 && mode === COMM_MODE.FULL) {
      if ((length - 10) % BLOCK !== 0) return this.fail('encrypted response is not block aligned');
      const ive = this.ivFor([0x5a, 0xa5]);
      const plain = cbcDecrypt(enc, ive, response.subarray(0, length - 10));
      let end = plain.length;
      for (let i = plain.length; i > 0; i--) {
        const byte = plain[i - 1];
        if (byte === 0x00) {
          end = i - 1;
        } else if (byte === 0x80) {
          end = i - 1;
          break;
        } else {
          break;
        }
      }
      return { data: Buffer.from(plain.subarray(0, end)), status };
    }
    const dataEnd = mode === COMM_MODE.PLAIN ? length - 2 : length - 10;
    return { data: Buffer.from(response.subarray(0, dataEnd)), status };
  }

  private fail(message: string): never {
    this.reset();
    throw new CardProtocolError(message);
  }

  /**
   * Mirrors ntag424_ChangeKey. keyNo 0 sends the new key as is, otherwise the
   * old/new key XOR followed by the inverted CRC32 of the new key.
   */
  encodeChangeKey(oldKey: Buffer, newKey: Buffer, keyNo: number, keyVersion: number): Buffer {
    requireKeyNo(keyNo);
    requireKey(oldKey, 'old key');
    requireKey(newKey, 'new key');
    if (!Number.isInteger(keyVersion) || keyVersion < 0 || keyVersion > 0xff) {
      throw new CardProtocolError('invalid key version');
    }
    let keyData: Buffer;
    if (keyNo > 0) {
      const crc = Buffer.alloc(4);
      crc.writeUInt32LE(~crc32(newKey) >>> 0);
      keyData = Buffer.concat([xor(oldKey, newKey), Buffer.from([keyVersion]), crc]);
    } else {
      keyData = Buffer.concat([newKey, Buffer.from([keyVersion])]);
    }
    try {
      return this.encode(
        { cla: CLA_NATIVE, ins: INS_CHANGE_KEY, mode: COMM_MODE.FULL, changedKeyNo: keyNo },
        Buffer.from([keyNo]),
        keyData,
      );
    } finally {
      keyData.fill(0);
    }
  }

  /**
   * Firmware ChangeKey success check (status 91 00), but with a verified MAC.
   *
   * - `confirmed`: the card confirmed the change with a valid MAC.
   * - `reauthenticate`: the session's own key was changed. The card answers a
   *   bare "91 00" and drops the session, so there is no MAC and a reader could
   *   forge it. Only a new authentication with the new key proves the change.
   * - `failed`: the card rejected the change or the reply failed the integrity
   *   check. In the second case the card may already hold the new key.
   *
   * Whatever the outcome, enrollment and reset must re-authenticate with the
   * expected key before they record the change as done.
   */
  decodeChangeKey(response: Buffer): ChangeKeyOutcome {
    const pending = this.pending;
    if (!this.authenticated || pending?.ins !== INS_CHANGE_KEY) {
      throw new CardProtocolError('no ChangeKey is waiting for a response');
    }
    if (pending.changedKeyNo === this.authKeyNo && response.length === 2) {
      this.reset();
      return response[0] === 0x91 && response[1] === 0x00 ? 'reauthenticate' : 'failed';
    }
    try {
      return this.decodeResponse(response).status === STATUS_OK ? 'confirmed' : 'failed';
    } catch (error) {
      if (error instanceof CardProtocolError) return 'failed';
      throw error;
    }
  }

  reset(): void {
    wipe(this.key, this.rndA, this.rndB, this.keyEnc, this.keyMac);
    this.phase = 'idle';
    this.key = this.rndA = this.rndB = this.keyEnc = this.keyMac = this.ti = null;
    this.authKeyNo = null;
    this.counter = 0;
    this.pending = null;
  }
}
