import type { ResourceFormAction } from './form';

/** Limits of the `image` form field type (ATT-879). */
export const MIN_FORM_IMAGES = 1;
export const MAX_FORM_IMAGES = 10;
export const DEFAULT_FORM_IMAGES = 1;

/** The longest edge of a stored form image, in pixels. */
export const FORM_IMAGE_MAX_EDGE = 2560;

/** How long an image that no submission references survives, and how long a reader handoff link stays valid. */
export const FORM_IMAGE_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
export const FORM_IMAGE_HANDOFF_TTL_MS = 15 * 60 * 1000;

/** The options of an image field as stored: a field without options accepts one image. */
export interface FormImageFieldOptions {
  maxImages: number;
}

/**
 * The path of the public phone page behind a reader's QR code: `<app url>/form-photo/<token>`. The API serves the
 * endpoints of the same link under `/api/form-photo/<token>`.
 */
export const FORM_PHOTO_ROUTE = '/form-photo';

/** Whether a max-images option is a whole number from MIN_FORM_IMAGES to MAX_FORM_IMAGES. */
export function isValidFormImageLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_FORM_IMAGES && value <= MAX_FORM_IMAGES;
}

/** How many images an image field accepts, from its stored options (null or missing means one). */
export function formImageLimit(options: unknown): number {
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const value = (options as { maxImages?: unknown }).maxImages;
    if (isValidFormImageLimit(value)) {
      return value;
    }
  }
  return DEFAULT_FORM_IMAGES;
}

/** The image ids of a stored image answer (a JSON array string). Anything else is no answer. */
export function parseFormImageIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** A stored, processed form image. `submissionId` stays null until a submission references it. */
export interface FormImageRecord {
  id: string;
  /** The user the image is for: its uploader, or the user of the reader handoff it came through. */
  userId: number;
  /** Null for uploads through a reader handoff link. */
  uploadedByUserId: number | null;
  handoffId: string | null;
  formId: number;
  fieldId: number;
  submissionId: number | null;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  filename: string;
  createdAt: Date;
}

/** A short-lived link that lets a phone add images to one field of a reader's open form. */
export interface FormImageHandoffRecord {
  id: string;
  readerId: number;
  userId: number;
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  fieldId: number;
  maxImages: number;
  uploadCount: number;
  expiresAt: Date;
  /** Set when the reader's form attempt ended (submit, cancel, sign-out, another user). */
  endedAt: Date | null;
  createdAt: Date;
}
