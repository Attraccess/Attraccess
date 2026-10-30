import { webcrypto } from 'crypto';
import type { WebSocket } from 'ws';
import type { PairingFailureReason } from '../dtos/pairing.dto';
import type { DerivedCode, LiteColour } from './pairing-protocol';

const MAX_FIRMWARE_FIELD = 64;

export const CREDENTIAL_CHANGED_EVENT = 'attractap.credential.changed';

export type PairingState = 'waiting' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type PairingMode = 'new' | 'pair' | 'takeover';
export type PairingMethod = 'code' | 'led-pattern' | 'flasher';

export interface Actor {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

export interface ApproveInput {
  /** Touch readers and the flasher: the code on the reader. */
  code?: string;
  /** Lite readers: the round of the pattern the admin compared. */
  round?: number;
  mode: PairingMode;
  targetReaderId?: number;
  name?: string;
  via?: 'flasher';
}

export interface ReaderFirmware {
  name: string;
  variant: string;
  version: string;
}

export interface Round {
  round: number;
  serverNonce: Buffer;
  readerNonce: Buffer | null;
  derived: DerivedCode | null;
}

export interface PairingRequest {
  id: string;
  ws: WebSocket;
  address: string;
  createdAt: number;
  expiresAt: number;
  kind: 'touch' | 'lite';
  firmware: ReaderFirmware;
  state: PairingState;
  readerPublicKey: Buffer;
  /** Set when the reader presented a binding ticket from its token connection in `hello`. */
  boundReaderId: number | null;
  serverPublicKey: Buffer;
  current: Round;
  previous: Round | null;
  nextRotationAt: number;
  /** An approval is being committed; no second one may start. */
  approving: boolean;
  mode: PairingMode | null;
  targetReaderId: number | null;
  rotationTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
  failureReason: PairingFailureReason | null;
}

export interface PairingView {
  id: string;
  state: PairingState;
  kind: 'touch' | 'lite';
  firmware: ReaderFirmware;
  boundReaderId: number | null;
  targetReaderId: number | null;
  mode: PairingMode | null;
  createdAt: Date;
  expiresAt: Date;
  failureReason: PairingFailureReason | null;
  /** Detail view of a Lite request only: the pattern to compare with the ring, and its round. */
  pattern?: LiteColour[] | null;
  round?: number | null;
}

/** What a freshly paired reader receives in its first (bootstrap) session. */
export interface BootstrapGrant {
  readerId: number;
  certificatePem: string;
}

export interface CachedGrant extends BootstrapGrant {
  expiresAt: number;
}

export const TERMINAL_STATES: PairingState[] = ['completed', 'failed', 'cancelled', 'expired'];

export function isTerminal(request: PairingRequest): boolean {
  return TERMINAL_STATES.includes(request.state);
}

export function roundsOf(request: PairingRequest): Round[] {
  return request.previous ? [request.current, request.previous] : [request.current];
}

export function validFirmware(value: unknown): ReaderFirmware {
  const firmware = value as Record<string, unknown> | undefined;
  const fields = ['name', 'variant', 'version'].map((key) => firmware?.[key]);
  if (!fields.every((field) => typeof field === 'string' && field.length > 0 && field.length <= MAX_FIRMWARE_FIELD)) {
    throw new Error('invalid firmware');
  }
  const [name, variant, version] = fields as string[];
  return { name, variant, version };
}

export async function canonicalP256Spki(encoded: unknown): Promise<Buffer> {
  if (typeof encoded !== 'string') throw new Error('invalid hello');
  const publicKey = Buffer.from(encoded, 'base64');
  // Rejects anything that is not a valid P-256 key in the canonical (uncompressed SPKI) form,
  // so the key approved here is the one later seen in the reader certificate.
  const imported = await webcrypto.subtle.importKey(
    'spki',
    new Uint8Array(publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  if (!Buffer.from(await webcrypto.subtle.exportKey('spki', imported)).equals(publicKey)) {
    throw new Error('non-canonical public key');
  }
  return publicKey;
}
