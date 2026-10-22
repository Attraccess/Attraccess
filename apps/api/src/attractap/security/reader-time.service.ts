import { Injectable } from '@nestjs/common';
import { constants, createPrivateKey, KeyObject, sign } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ReaderIdentityService, readProtectedReaderFile } from './reader-identity.service';
import { READER_LIMITS } from '../websockets/reader-frame';

const DOMAIN = Buffer.alloc(16);
DOMAIN.write('ATTR-TIME-V1', 'ascii');

export function encodeSignedReaderTime(fields: {
  keyId: number;
  installationId: string;
  fingerprint: string;
  challenge: Uint8Array;
  seconds: bigint;
}): Buffer {
  if (
    !Number.isInteger(fields.keyId) ||
    fields.keyId < 1 ||
    fields.keyId > 0xffffffff ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(fields.installationId) ||
    !/^[a-f0-9]{64}$/.test(fields.fingerprint) ||
    fields.challenge.length !== 32 ||
    fields.seconds < 1577836800n ||
    fields.seconds > 253402300799n
  )
    throw new Error('Invalid signed time fields');
  const message = Buffer.alloc(109);
  DOMAIN.copy(message);
  message[16] = 1;
  message.writeUInt32BE(fields.keyId, 17);
  Buffer.from(fields.installationId.replace(/-/g, ''), 'hex').copy(message, 21);
  Buffer.from(fields.fingerprint, 'hex').copy(message, 37);
  message.set(fields.challenge, 69);
  message.writeBigUInt64BE(fields.seconds, 101);
  return message;
}

@Injectable()
export class ReaderTimeService {
  private readonly peers = new Map<string, { tokens: number; at: number }>();
  constructor(private readonly identities: ReaderIdentityService) {}

  private admit(peer: string): boolean {
    const now = performance.now();
    for (const [address, bucket] of this.peers) if (now - bucket.at > 60_000) this.peers.delete(address);
    if (!peer || (!this.peers.has(peer) && this.peers.size >= 1024)) return false;
    const bucket = this.peers.get(peer) ?? { tokens: 2, at: now };
    bucket.tokens = Math.min(2, bucket.tokens + (now - bucket.at) / 1000);
    bucket.at = now;
    this.peers.set(peer, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
  }

  /** Bootstrap v1: version, installation UUID, public key fingerprint, fresh challenge (81 bytes). */
  async reply(request: Buffer, peer: string): Promise<Buffer> {
    if (request.length > READER_LIMITS.bootstrap || request.length !== 81 || request[0] !== 1 || !this.admit(peer))
      throw new Error('Reader time request denied');
    const configuration = this.identities.configuration();
    const fingerprint = request.subarray(17, 49).toString('hex');
    const identity = await this.identities.findForTime(fingerprint);
    if (
      !configuration ||
      !identity ||
      !request.subarray(1, 17).equals(Buffer.from(configuration.installationId.replace(/-/g, ''), 'hex'))
    )
      throw new Error('Reader time request denied');
    const encoded = readProtectedReaderFile(configuration.timeKeyFile);
    let key: KeyObject;
    let keyId: number;
    try {
      const ring = JSON.parse(encoded.toString('utf8'));
      if (
        !Array.isArray(ring.keys) ||
        ring.keys.length < 1 ||
        ring.keys.length > 2 ||
        new Set(ring.keys.map((entry) => entry.id)).size !== ring.keys.length
      )
        throw new Error('Invalid reader time keyring');
      const now = Date.now();
      for (const entry of ring.keys) {
        if (
          !Number.isInteger(entry.id) ||
          entry.id < 1 ||
          entry.id > 0xffffffff ||
          typeof entry.pem !== 'string' ||
          !Number.isSafeInteger(entry.validFrom) ||
          !Number.isSafeInteger(entry.validUntil) ||
          entry.validUntil <= entry.validFrom ||
          typeof entry.retired !== 'boolean'
        )
          throw new Error('Invalid reader time keyring');
      }
      const selected = ring.keys.find(
        (entry) => entry.id === ring.active && !entry.retired && entry.validFrom <= now && entry.validUntil > now,
      );
      if (!selected) throw new Error('Reader time key unavailable');
      keyId = selected.id;
      key = createPrivateKey(selected.pem);
      if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 3072)
        throw new Error('Reader time key must be RSA-3072');
    } finally {
      encoded.fill(0);
    }
    const message = encodeSignedReaderTime({
      keyId,
      installationId: configuration.installationId,
      fingerprint,
      challenge: request.subarray(49),
      seconds: BigInt(Math.floor(Date.now() / 1000)),
    });
    const signature = sign('sha256', message, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
    if (signature.length !== 384) throw new Error('Invalid reader time signature size');
    return Buffer.concat([message, signature]);
  }
}
