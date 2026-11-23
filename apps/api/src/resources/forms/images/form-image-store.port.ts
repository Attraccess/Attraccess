import type { FormImageHandoffRecord, FormImageRecord, ResourceFormAction } from '@attraccess/application-models';

export const FORM_IMAGE_STORE = Symbol.for('attraccess.resources.form-image-store');

/**
 * A stored image. `userId` is null once its user was deleted: such an image belongs to nobody, no check matches it, and
 * the cleanup job removes it with its file.
 */
export interface StoredFormImage extends Omit<FormImageRecord, 'userId'> {
  userId: number | null;
}

export type NewFormImage = Omit<FormImageRecord, 'createdAt' | 'submissionId'>;

export type NewFormImageHandoff = Omit<FormImageHandoffRecord, 'createdAt' | 'endedAt'> & { tokenHash: string };

/** What identifies the form attempt a handoff belongs to. */
export interface FormImageHandoffKey {
  readerId: number;
  userId: number;
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  fieldId: number;
}

/** An image with the user its submission belongs to (null while it is not attached). */
export interface FormImageOwnership {
  image: StoredFormImage;
  submissionUserId: number | null;
}

/**
 * Stored form images and the reader handoff links (ATT-879). All state lives in the database, so any API instance can
 * serve a phone whose reader is connected to another one.
 */
export interface FormImageStore {
  insertImage(image: NewFormImage): Promise<StoredFormImage>;

  findImage(id: string): Promise<StoredFormImage | null>;

  findImageWithOwner(id: string): Promise<FormImageOwnership | null>;

  /** The images with these ids that exist (missing ids are left out). */
  findImages(ids: string[]): Promise<StoredFormImage[]>;

  /** The not yet attached images uploaded through a handoff, oldest first. */
  listHandoffImages(handoffId: string): Promise<StoredFormImage[]>;

  /** How many not yet attached images a handoff holds. */
  countHandoffImages(handoffId: string): Promise<number>;

  /** How many not yet attached images of a user were uploaded since then. */
  countUnattachedImages(userId: number, since: Date): Promise<number>;

  /**
   * Deletes an image row only while no submission has it (and, with `handoffId`, only while it belongs to that
   * handoff). Returns whether a row was deleted: false when it was attached, moved or deleted meanwhile.
   */
  deleteUnattachedImage(id: string, handoffId?: string): Promise<boolean>;

  insertHandoff(handoff: NewFormImageHandoff): Promise<FormImageHandoffRecord>;

  findHandoffByTokenHash(tokenHash: string): Promise<FormImageHandoffRecord | null>;

  /** The attempt's newest handoff that was not ended, expired ones included. */
  findLatestHandoff(key: FormImageHandoffKey): Promise<FormImageHandoffRecord | null>;

  /** Hands over the not yet attached images of an expired handoff to its successor. */
  moveHandoffImages(fromHandoffId: string, toHandoffId: string): Promise<void>;

  /**
   * Ends every open handoff of the reader (the form attempt ended), or only those of one resource and action.
   * Returns how many were ended.
   */
  endHandoffs(readerId: number, now: Date, only?: { resourceId: number; action: ResourceFormAction }): Promise<number>;

  /** Ends the open handoffs with these ids (the ones one reader connection issued). Returns how many were ended. */
  endHandoffsById(ids: string[], now: Date): Promise<number>;

  /** Counts one more upload, atomically, while the handoff is open, not expired and below its upload limit. */
  reserveHandoffUpload(handoffId: string, now: Date): Promise<boolean>;

  /** Gives back an upload that was reserved but failed. */
  releaseHandoffUpload(handoffId: string): Promise<void>;

  /** Ends one handoff (it was replaced by a newer one). */
  endHandoff(handoffId: string, now: Date): Promise<void>;

  /**
   * Orphaned images, oldest first: not attached and uploaded before the cut-off, or not attached and of a deleted
   * user (any age).
   */
  findOrphanImages(uploadedBefore: Date, limit: number): Promise<StoredFormImage[]>;

  /**
   * Deletes the rows with these ids that are still not attached, and returns the file names of the deleted ones. An
   * image attached since it was found as an orphan keeps its row, and its file must stay too.
   */
  deleteOrphanImages(ids: string[]): Promise<string[]>;

  /**
   * Deletes handoffs that expired or ended before the cut-off, except those that still hold not yet attached images:
   * an open reader attempt reads its answer through the handoff.
   */
  deleteStaleHandoffs(before: Date): Promise<number>;
}
