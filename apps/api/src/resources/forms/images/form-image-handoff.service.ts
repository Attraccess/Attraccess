import { GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ReadStream } from 'fs';
import {
  FORM_IMAGE_HANDOFF_TTL_MS,
  FormFieldType,
  formImageLimit,
  type FormImageHandoffRecord,
  type ResourceFormAction,
  type FormImageRecord,
} from '@attraccess/application-models';
import type { FileUpload } from '../../../common/types/file-upload.types';
import { SettingsService } from '../../../settings/settings.service';
import { ResourceFormsService } from '../forms.service';
import { FormImageDto, FormPhotoPageDto } from './form-image.dto';
import { FORM_IMAGE_STORE, type FormImageHandoffKey, type FormImageStore } from './form-image-store.port';
import { FormImagesService, toImageDto } from './form-images.service';

/** 18 random bytes: 144 bits, 24 base64url characters, which keeps the QR code small. */
const TOKEN_BYTES = 18;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export const FORM_PHOTO_ROUTE = '/form-photo';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The state a reader keeps in its socket to show the same link again; the database only has the hash. */
export interface RememberedHandoff {
  handoffId: string;
  token: string;
}

/** What the reader shows for one image field. */
export interface ReaderHandoffView extends RememberedHandoff {
  handoffUrl: string;
  imageCount: number;
  maxImages: number;
}

class FormPhotoLinkExpiredException extends GoneException {
  constructor() {
    super('FormPhotoLinkExpired');
  }
}

/**
 * The phone side of an image field on a reader (ATT-879). A handoff is a random token, stored hashed and bound to a
 * reader, user, resource, action, form and field. It is valid until it expires (15 minutes), its form attempt ends, or
 * it has taken the field's maximum of uploads. Holding the link is the authorisation, so every operation below only
 * ever reaches the images uploaded under that one token.
 */
@Injectable()
export class FormImageHandoffService {
  constructor(
    @Inject(FORM_IMAGE_STORE) private readonly store: FormImageStore,
    private readonly forms: ResourceFormsService,
    private readonly images: FormImagesService,
    private readonly settings: SettingsService,
  ) {}

  /** Whether a link can be built at all: the public app URL has to be set. */
  async canIssue(): Promise<boolean> {
    return Boolean(await this.appUrl());
  }

  private async appUrl(): Promise<string | null> {
    return ((await this.settings.getUrl().catch(() => null)) || '').replace(/\/+$/, '') || null;
  }

  // --- reader side ------------------------------------------------------------------------------------------------

  /**
   * The link for the reader's image field: the remembered one while it is valid, otherwise a fresh one that takes over
   * the images and the upload count of the old one (so a new link never grants more than the field allows).
   */
  async openForReader(
    key: FormImageHandoffKey,
    fieldOptions: unknown,
    remembered?: RememberedHandoff,
    now = new Date(),
  ): Promise<ReaderHandoffView> {
    const maxImages = formImageLimit(fieldOptions);
    const latest = await this.store.findLatestHandoff(key);
    if (latest && remembered?.handoffId === latest.id && latest.expiresAt > now) {
      return this.view(latest, remembered.token);
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const created = await this.store.insertHandoff({
      id: randomUUID(),
      tokenHash: hashToken(token),
      ...key,
      maxImages,
      uploadCount: latest?.uploadCount ?? 0,
      expiresAt: new Date(now.getTime() + FORM_IMAGE_HANDOFF_TTL_MS),
    });
    if (latest) {
      await this.store.moveHandoffImages(latest.id, created.id);
      await this.store.endHandoff(latest.id, now);
    }
    return this.view(created, token);
  }

  private async view(handoff: FormImageHandoffRecord, token: string): Promise<ReaderHandoffView> {
    return {
      handoffId: handoff.id,
      token,
      handoffUrl: `${(await this.appUrl()) ?? ''}${FORM_PHOTO_ROUTE}/${token}`,
      imageCount: (await this.store.listHandoffImages(handoff.id)).length,
      maxImages: handoff.maxImages,
    };
  }

  /** The ids the server knows for a handoff: what the reader's answer to the field is. */
  async imageIds(handoffId: string): Promise<string[]> {
    return (await this.store.listHandoffImages(handoffId)).map((image) => image.id);
  }

  /** The form attempt of the reader ended (submit, cancel, sign-out, another user): its links stop working. */
  async endForReader(readerId: number, only?: { resourceId: number; action: ResourceFormAction }): Promise<void> {
    await this.store.endHandoffs(readerId, new Date(), only);
  }

  // --- phone side, by token -----------------------------------------------------------------------------------------

  /** The open handoff of a token; an unknown, expired, ended or used-up link is gone (410). */
  async resolve(token: string, now = new Date()): Promise<FormImageHandoffRecord> {
    const handoff = TOKEN_PATTERN.test(token) ? await this.store.findHandoffByTokenHash(hashToken(token)) : null;
    if (!handoff || handoff.endedAt || handoff.expiresAt <= now || handoff.uploadCount >= handoff.maxImages) {
      throw new FormPhotoLinkExpiredException();
    }
    return handoff;
  }

  private async resolveField(handoff: FormImageHandoffRecord) {
    try {
      return await this.forms.resolveImageField(handoff.resourceId, handoff.action, handoff.formId, handoff.fieldId);
    } catch {
      throw new FormPhotoLinkExpiredException();
    }
  }

  async page(token: string): Promise<FormPhotoPageDto> {
    const handoff = await this.resolve(token);
    const { form, field, resourceName } = await this.resolveField(handoff);
    return {
      resourceName,
      formName: form.name,
      fieldName: field.name,
      fieldDescription: field.description,
      maxImages: handoff.maxImages,
      uploadsRemaining: Math.max(0, handoff.maxImages - handoff.uploadCount),
      expiresAt: handoff.expiresAt,
      images: (await this.store.listHandoffImages(handoff.id)).map(toImageDto),
    };
  }

  async upload(token: string, file: FileUpload | undefined): Promise<FormImageDto> {
    const handoff = await this.resolve(token);
    const { field } = await this.resolveField(handoff);
    if (field.type !== FormFieldType.IMAGE) throw new FormPhotoLinkExpiredException();
    if (!(await this.store.reserveHandoffUpload(handoff.id, new Date()))) throw new FormPhotoLinkExpiredException();
    try {
      return await this.images.save(file, {
        formId: handoff.formId,
        fieldId: handoff.fieldId,
        userId: handoff.userId,
        uploadedByUserId: null,
        handoffId: handoff.id,
      });
    } catch (error) {
      await this.store.releaseHandoffUpload(handoff.id);
      throw error;
    }
  }

  /** An image of this handoff only: any other id is gone, as far as the holder of the link can tell. */
  private async imageOf(handoff: FormImageHandoffRecord, imageId: string): Promise<FormImageRecord> {
    const image = await this.store.findImage(imageId);
    if (!image || image.handoffId !== handoff.id || image.submissionId !== null) {
      throw new NotFoundException('Image not found');
    }
    return image;
  }

  async openImage(token: string, imageId: string): Promise<{ stream: ReadStream }> {
    const image = await this.imageOf(await this.resolve(token), imageId);
    return { stream: await this.images.open(image) };
  }

  async removeImage(token: string, imageId: string): Promise<void> {
    const image = await this.imageOf(await this.resolve(token), imageId);
    await this.images.remove(image);
  }
}
