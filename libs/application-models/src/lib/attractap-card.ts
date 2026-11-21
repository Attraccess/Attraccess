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

/** An NFC card. `key` and `keyNo` are secrets of the card; they never belong in a response. */
export interface AttractapNfcCard {
  id: number;
  uid: string;
  keyNo: number;
  /** Stored encrypted; the card service decrypts it for use. */
  key: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeen: Date;
  isActive: boolean;
  /** Present when the read asked for the owner. */
  user?: AttractapCardOwner;
}

export interface NewAttractapNfcCard {
  uid: string;
  keyNo: number;
  /** Already encrypted. */
  key: string;
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
