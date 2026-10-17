import { User } from './user';

export interface Passkey {
  id: number;
  userId: number;
  /** base64url encoded WebAuthn credential ID; never leaves the server */
  credentialId: string;
  /** base64url encoded COSE public key of the credential; never leaves the server */
  publicKey: string;
  /** signature counter last reported by the authenticator; never leaves the server */
  counter: number;
  transports: string | null;
  name: string;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  user: User;
}

/**
 * A pending WebAuthn ceremony challenge. Persisted (rather than kept in memory) so that
 * registration/authentication keeps working across API replicas and restarts.
 */
export interface PasskeyChallenge {
  id: number;
  challenge: string;
  /** null for authentication ceremonies, which are usernameless (discoverable credentials) */
  userId: number | null;
  expiresAt: Date;
}
