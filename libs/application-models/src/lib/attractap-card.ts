/** The user a card belongs to: the user row, without its relations. `email` is internal. */
export interface AttractapCardOwner {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  externalIdentifier: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/** How a card is checked: `aes` proves a key the server holds, `uid-only` is accepted on its UID alone (insecure). */
export type AttractapNfcCardType = 'aes' | 'uid-only';

/** An NFC card. `key` and `keyNo` are secrets of the card; they never belong in a response. */
export interface AttractapNfcCard {
  id: number;
  uid: string;
  type: AttractapNfcCardType;
  /** Null for a UID-only card. */
  keyNo: number | null;
  /** Stored encrypted; the card service decrypts it for use. Null for a UID-only card. */
  key: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeen: Date;
  isActive: boolean;
  /** Present when the read asked for the owner. */
  user?: AttractapCardOwner;
}

export interface NewAttractapNfcCard {
  uid: string;
  /** `aes` when not given. */
  type?: AttractapNfcCardType;
  /** Null for a UID-only card. */
  keyNo: number | null;
  /** Already encrypted. Null for a UID-only card. */
  key: string | null;
}

/** A key change the server started but has not seen confirmed yet. */
export interface AttractapNfcCardPendingChange {
  id: number;
  uid: string;
  kind: 'enroll' | 'reset';
  userId: number | null;
  cardId: number | null;
  keyNo: number;
  /** Encrypted; null for a reset. */
  key: string | null;
  actorId: number | null;
  createdAt: Date;
}

export type NewAttractapNfcCardPendingChange = Omit<AttractapNfcCardPendingChange, 'id' | 'createdAt'>;
