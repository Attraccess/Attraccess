import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { aesCmac } from './aes';

/**
 * Minimal DESFire EV2/EV3 + NTAG 424 card model for tests.
 *
 * It implements the card side of AuthenticateEV2First and secure messaging
 * with its own helpers (it only shares AES-CMAC, which has RFC 4493 vectors),
 * so a mismatch with the server shows up as a failed exchange. It follows the
 * firmware where firmware and NXP docs disagree (e.g. the IV counter quirk);
 * the AN12196 known-answer tests in the spec are the independent check.
 */
export type Misbehaviour =
  | 'none'
  /** Answers AuthenticateEV2First part 2 with a random proof instead of RndA'. */
  | 'no-proof'
  /** Rotates RndA right instead of left. */
  | 'wrong-rotation'
  /** Corrupts the response MAC of ChangeKey. */
  | 'bad-response-mac'
  /** Replays the previous response for every command except authentication. */
  | 'replay-last-response'
  /** A hostile reader: answers every in-session command with a bare "91 00" and never reaches the card. */
  | 'forge-bare-success';

const PN532_MAX_COMMAND = 62;

export class EmulatedCard {
  readonly keys: Buffer[];
  readonly keyVersions: number[];
  appExists = false;
  appSelected = false;
  misbehaviour: Misbehaviour = 'none';
  /** Number of ChangeKey commands that succeed before the card starts failing writes (tearing). */
  failWritesAfter = Infinity;
  private writes = 0;
  private pending: { keyNo: number; rndB: Buffer } | null = null;
  private session: { enc: Buffer; mac: Buffer; ti: Buffer; counter: number; keyNo: number } | null = null;
  private lastResponse: Buffer | null = null;

  constructor(
    public readonly kind: 'desfire' | 'ntag424',
    keyCount = kind === 'ntag424' ? 5 : 6,
    private readonly random: (n: number) => Buffer = randomBytes,
  ) {
    this.keys = Array.from({ length: keyCount }, () => Buffer.alloc(16));
    this.keyVersions = Array.from({ length: keyCount }, () => 0);
    if (kind === 'ntag424') this.appExists = true;
  }

  get authenticated(): boolean {
    return this.session !== null;
  }

  transceive(apdu: Buffer): Buffer {
    if (apdu.length > PN532_MAX_COMMAND) throw new Error(`command of ${apdu.length} bytes does not fit the PN532`);
    if (this.misbehaviour === 'forge-bare-success' && this.session && apdu[1] !== 0x71 && apdu[1] !== 0xaf) {
      return Buffer.from([0x91, 0x00]);
    }
    const response = this.handle(apdu);
    if (this.misbehaviour === 'replay-last-response' && this.lastResponse && apdu[1] !== 0x71 && apdu[1] !== 0xaf) {
      return this.lastResponse;
    }
    this.lastResponse = response;
    return response;
  }

  /** Error status: like a real card, it ends any authenticated session. */
  private error(sw2: number): Buffer {
    this.session = null;
    this.pending = null;
    return Buffer.from([0x91, sw2]);
  }

  private handle(apdu: Buffer): Buffer {
    const [cla, ins] = apdu;
    const data = apdu.subarray(5, 5 + apdu[4]);
    if (cla === 0x00 && ins === 0xa4) {
      this.session = null;
      this.appSelected = this.kind === 'ntag424';
      return this.kind === 'ntag424' ? Buffer.from([0x90, 0x00]) : Buffer.from([0x6a, 0x82]);
    }
    switch (ins) {
      case 0x5a:
        this.session = null;
        if (this.kind !== 'desfire' || !this.appExists || !data.equals(Buffer.from([0x55, 0xce, 0xac]))) {
          return this.error(0xa0);
        }
        this.appSelected = true;
        return Buffer.from([0x91, 0x00]);
      case 0xca:
        if (this.kind !== 'desfire' || !data.equals(Buffer.from([0x55, 0xce, 0xac, 0x0f, 0x86])))
          return this.error(0x9e);
        if (this.appExists) return this.error(0xde);
        this.appExists = true;
        return Buffer.from([0x91, 0x00]);
      case 0x64:
        if (!this.appSelected || data[0] >= this.keys.length) return this.error(0x40);
        return Buffer.from([this.keyVersions[data[0]], 0x91, 0x00]);
      case 0x60:
        this.session = null;
        this.versionFrame = 1;
        return Buffer.concat([this.version(1), Buffer.from([0x91, 0xaf])]);
      case 0x71:
        return this.authFirst(data[0]);
      case 0xaf:
        if (this.versionFrame > 0) return this.nextVersionFrame();
        return this.authSecond(data);
      case 0xc4:
        return this.changeKey(data, apdu);
      default:
        return this.error(0x1c);
    }
  }

  /** GetVersion: vendor, type, subtype, major, minor, storage, protocol (NTAG 424: type 04; DESFire EV2: 01, major 0x12). */
  hardwareMajor = 0x12;
  private versionFrame = 0;

  private version(frame: number): Buffer {
    if (frame === 1) {
      return this.kind === 'ntag424'
        ? Buffer.from([0x04, 0x04, 0x02, 0x30, 0x00, 0x11, 0x05])
        : Buffer.from([0x04, 0x01, 0x01, this.hardwareMajor, 0x00, 0x1a, 0x05]);
    }
    if (frame === 2) return Buffer.from([0x04, 0x04, 0x02, 0x01, 0x02, 0x11, 0x05]);
    return Buffer.concat([
      Buffer.from([0x04, 0x6a, 0x15, 0x2b, 0x4c, 0x80]),
      Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
    ]).subarray(0, 14);
  }

  private nextVersionFrame(): Buffer {
    this.versionFrame += 1;
    const frame = this.version(this.versionFrame);
    if (this.versionFrame >= 3) {
      this.versionFrame = 0;
      return Buffer.concat([frame, Buffer.from([0x91, 0x00])]);
    }
    return Buffer.concat([frame, Buffer.from([0x91, 0xaf])]);
  }

  private authFirst(keyNo: number): Buffer {
    this.versionFrame = 0;
    this.session = null;
    if (!this.appSelected || keyNo >= this.keys.length) return this.error(0x40);
    const rndB = this.random(16);
    this.pending = { keyNo, rndB };
    return Buffer.concat([aes('enc', this.keys[keyNo], Buffer.alloc(16), rndB), Buffer.from([0x91, 0xaf])]);
  }

  private authSecond(data: Buffer): Buffer {
    if (!this.pending || data.length !== 32) return this.error(0xca);
    const { keyNo, rndB } = this.pending;
    this.pending = null;
    const key = this.keys[keyNo];
    const plain = aes('dec', key, Buffer.alloc(16), data);
    const rndA = plain.subarray(0, 16);
    const rotB = Buffer.concat([rndB.subarray(1), rndB.subarray(0, 1)]);
    if (!plain.subarray(16, 32).equals(rotB)) return this.error(0xae);
    const ti = this.random(4);
    const rotA = Buffer.concat([rndA.subarray(1), rndA.subarray(0, 1)]);
    const rotRight = Buffer.concat([rndA.subarray(15), rndA.subarray(0, 15)]);
    const proof =
      this.misbehaviour === 'no-proof' ? this.random(16) : this.misbehaviour === 'wrong-rotation' ? rotRight : rotA;
    const body = Buffer.concat([ti, proof, Buffer.alloc(12)]);
    const sv = (a: number, b: number) =>
      Buffer.concat([
        Buffer.from([a, b, 0, 1, 0, 0x80]),
        rndA.subarray(0, 2),
        xor(rndA.subarray(2, 8), rndB.subarray(0, 6)),
        rndB.subarray(6, 16),
        rndA.subarray(8, 16),
      ]);
    this.session = { enc: aesCmac(key, sv(0xa5, 0x5a)), mac: aesCmac(key, sv(0x5a, 0xa5)), ti, counter: 0, keyNo };
    return Buffer.concat([aes('enc', key, Buffer.alloc(16), body), Buffer.from([0x91, 0x00])]);
  }

  private changeKey(data: Buffer, apdu: Buffer): Buffer {
    const s = this.session;
    if (!s) return this.error(0xae);
    const keyNo = data[0];
    if (keyNo >= this.keys.length) return this.error(0x40);
    const enc = data.subarray(1, data.length - 8);
    const mac = data.subarray(data.length - 8);
    const expected = truncatedMac(
      s.mac,
      Buffer.concat([Buffer.from([apdu[1]]), counterLe(s.counter), s.ti, data.subarray(0, 1), enc]),
    );
    if (!expected.equals(mac)) return this.error(0x1e);
    const ivPlain = Buffer.alloc(16);
    ivPlain.set([0xa5, 0x5a]);
    s.ti.copy(ivPlain, 2);
    ivPlain[6] = s.counter & 0xff;
    const iv = aes('enc', s.enc, Buffer.alloc(16), ivPlain);
    const plain = aes('dec', s.enc, iv, enc);
    this.writes += 1;
    if (this.writes > this.failWritesAfter) return this.error(0xee);
    if (keyNo === 0) {
      this.keys[0] = Buffer.from(plain.subarray(0, 16));
      this.keyVersions[0] = plain[16];
    } else {
      const newKey = xor(plain.subarray(0, 16), this.keys[keyNo]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32LE(~crc32(newKey) >>> 0);
      if (!crc.equals(plain.subarray(17, 21))) return this.error(0x1e);
      this.keys[keyNo] = newKey;
      this.keyVersions[keyNo] = plain[16];
    }
    if (keyNo === s.keyNo) {
      // Changing the key we authenticated with ends the session; no MAC follows.
      this.session = null;
      return Buffer.from([0x91, 0x00]);
    }
    s.counter += 1;
    const respMac = truncatedMac(s.mac, Buffer.concat([Buffer.from([0x00]), counterLe(s.counter), s.ti]));
    if (this.misbehaviour === 'bad-response-mac') respMac[0] ^= 0xff;
    return Buffer.concat([respMac, Buffer.from([0x91, 0x00])]);
  }
}

function aes(direction: 'enc' | 'dec', key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher =
    direction === 'enc' ? createCipheriv('aes-128-cbc', key, iv) : createDecipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** MACt: bytes 1, 3, .., 15 of the full CMAC. */
function truncatedMac(key: Buffer, input: Buffer): Buffer {
  const full = aesCmac(key, input);
  return Buffer.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

function counterLe(counter: number): Buffer {
  return Buffer.from([counter & 0xff, (counter >> 8) & 0xff]);
}

function xor(a: Buffer, b: Buffer): Buffer {
  if (a.length !== b.length) throw new Error('xor length mismatch');
  return Buffer.from(a.map((v, i) => v ^ b[i]));
}
