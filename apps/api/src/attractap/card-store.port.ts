import type {
  AttractapCardOwner,
  AttractapNfcCard,
  AttractapNfcCardPendingChange,
  NewAttractapNfcCard,
  NewAttractapNfcCardPendingChange,
} from '@attraccess/application-models';

/** NFC cards and the pending key changes of enrollments and resets. Keys are stored encrypted. */
export interface AttractapCardStore {
  /** With the owner. */
  findById(id: number): Promise<AttractapNfcCard | undefined>;
  /** With the owner. */
  findByUid(uid: string): Promise<AttractapNfcCard | undefined>;
  /** Without the owner. */
  listForUser(userId: number): Promise<AttractapNfcCard[]>;
  listAll(): Promise<AttractapNfcCard[]>;
  userHasActiveCard(userId: number): Promise<boolean>;
  /**
   * Stores the card for the owner; with `activate` the owner's other cards are switched off in the same
   * transaction. The returned card carries the owner as passed in, projected to the card owner fields.
   */
  create(owner: AttractapCardOwner, card: NewAttractapNfcCard, activate: boolean): Promise<AttractapNfcCard>;
  /** Activates the card and deactivates the user's other cards atomically. Throws when the card does not exist. */
  activateExclusively(id: number): Promise<AttractapNfcCard>;
  deactivate(id: number): Promise<void>;
  /** True when a card was deleted. */
  delete(id: number): Promise<boolean>;
  recordSeen(id: number, at: Date): Promise<void>;

  findPendingEnroll(uid: string): Promise<AttractapNfcCardPendingChange | null>;
  listPendingEnrolls(uid: string): Promise<AttractapNfcCardPendingChange[]>;
  listPendingResets(uid: string): Promise<AttractapNfcCardPendingChange[]>;
  savePending(change: NewAttractapNfcCardPendingChange): Promise<AttractapNfcCardPendingChange>;
  deletePendingById(ids: number | number[]): Promise<void>;
  deletePendingByUid(uid: string, kind: 'enroll' | 'reset'): Promise<void>;
}

export const ATTRACTAP_CARD_STORE = Symbol.for('attraccess.attractap.card-store');
