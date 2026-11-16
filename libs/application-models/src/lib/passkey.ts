/** A registered WebAuthn credential. The credential id, public key and counter never leave the server. */
export interface PasskeyRecord {
  id: number;
  userId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  name: string;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface NewPasskey {
  userId: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  name: string;
  backedUp: boolean;
}

/** A pending WebAuthn ceremony challenge. `userId` is null for usernameless authentication ceremonies. */
export interface PasskeyChallengeRecord {
  challenge: string;
  userId: number | null;
  expiresAt: Date;
}
