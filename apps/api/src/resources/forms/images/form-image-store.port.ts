import type { FormImageHandoffRecord, FormImageRecord, ResourceFormAction } from '@attraccess/application-models';

export const FORM_IMAGE_STORE = Symbol.for('attraccess.resources.form-image-store');

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
  image: FormImageRecord;
  submissionUserId: number | null;
}

/**
 * Stored form images and the reader handoff links (ATT-879). All state lives in the database, so any API instance can
 * serve a phone whose reader is connected to another one.
 */
export interface FormImageStore {
  insertImage(image: NewFormImage): Promise<FormImageRecord>;

  findImage(id: string): Promise<FormImageRecord | null>;

  findImageWithOwner(id: string): Promise<FormImageOwnership | null>;

  /** The images with these ids that exist (missing ids are left out). */
  findImages(ids: string[]): Promise<FormImageRecord[]>;

  /** The images uploaded through a handoff, oldest first. */
  listHandoffImages(handoffId: string): Promise<FormImageRecord[]>;

  deleteImage(id: string): Promise<void>;

  insertHandoff(handoff: NewFormImageHandoff): Promise<FormImageHandoffRecord>;

  findHandoffByTokenHash(tokenHash: string): Promise<FormImageHandoffRecord | null>;

  /** The attempt's newest handoff that was not ended, expired ones included. */
  findLatestHandoff(key: FormImageHandoffKey): Promise<FormImageHandoffRecord | null>;

  /** Hands over the images of an expired handoff to its successor. */
  moveHandoffImages(fromHandoffId: string, toHandoffId: string): Promise<void>;

  /**
   * Ends every open handoff of the reader (the form attempt ended), or only those of one resource and action.
   * Returns how many were ended.
   */
  endHandoffs(readerId: number, now: Date, only?: { resourceId: number; action: ResourceFormAction }): Promise<number>;

  /** Counts one more upload, atomically, while the handoff is open, not expired and below its upload limit. */
  reserveHandoffUpload(handoffId: string, now: Date): Promise<boolean>;

  /** Gives back an upload that was reserved but failed. */
  releaseHandoffUpload(handoffId: string): Promise<void>;

  /** Ends one handoff (it was replaced by a newer one). */
  endHandoff(handoffId: string, now: Date): Promise<void>;

  /** Orphaned images (never attached) uploaded before the cut-off, oldest first. */
  findOrphanImages(uploadedBefore: Date, limit: number): Promise<FormImageRecord[]>;

  deleteImages(ids: string[]): Promise<void>;

  /** Deletes handoffs that expired or ended before the cut-off. */
  deleteStaleHandoffs(before: Date): Promise<number>;
}
