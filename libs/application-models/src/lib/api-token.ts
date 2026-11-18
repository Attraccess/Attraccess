/** An API token as the application knows it. The token secret and its hash are never part of it. */
export interface ApiTokenRecord {
  id: number;
  userId: number;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  permissionKeys: string[];
}

/** What is stored when a token is issued. The hash is the only form of the secret that reaches storage. */
export interface NewApiToken {
  userId: number;
  name: string;
  tokenHash: string;
  expiresAt: Date | null;
  permissionKeys: string[];
}

/** The editable parts of a token. A field that is absent stays as it is. */
export interface ApiTokenChanges {
  name?: string;
  permissionKeys?: string[];
  expiresAt?: Date | null;
}

export interface ApiTokenPage {
  data: ApiTokenRecord[];
  total: number;
}
