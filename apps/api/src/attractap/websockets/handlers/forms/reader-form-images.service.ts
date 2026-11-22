import { Inject, Injectable, Logger } from '@nestjs/common';
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import { FormImageHandoffService } from '../../../../resources/forms/images/form-image-handoff.service';
import type { FormResponseDto } from '../../../../resources/forms/dto/form-response.dto';
import type { FormFieldResponseDto } from '../../../../resources/forms/dto/form-field.dto';
import type { AuthenticatedWebSocket, FormFieldAnswerValue } from '../../websocket.types';

/** What an old reader shows (as a start block, on its button) when a required form needs a photo it cannot take. */
export const FORM_PHOTO_UNSUPPORTED_REASON = {
  code: 'FORM_PHOTO_UNSUPPORTED',
  title: 'Formular mit Foto',
  body: 'Formular mit Foto bitte in der Web-App ausfüllen.\nComplete this form in the web app.',
} as const;

const isImage = (field: Pick<FormFieldResponseDto, 'type'>) => field.type === FormFieldType.IMAGE;

/**
 * Image fields on readers (ATT-879). A reader with `capabilities.formImages` shows an image field as the QR code of a
 * phone handoff; older readers never get the field type: optional image fields are left out, a required one stops
 * the action with a message that points to the web app.
 */
@Injectable()
export class ReaderFormImages {
  private readonly logger = new Logger(ReaderFormImages.name);

  @Inject(FormImageHandoffService)
  private handoffs: FormImageHandoffService;

  private key(resourceId: number, action: ResourceFormAction, formId: number, fieldId: number): string {
    return `${resourceId}:${action}:${formId}:${fieldId}`;
  }

  /** Whether this reader can show image fields, and the server can build the link they need. */
  async supports(socket: AuthenticatedWebSocket): Promise<boolean> {
    return socket.state.formImages === true && (await this.handoffs.canIssue());
  }

  /**
   * The forms as this reader can show them. For a reader without image support the image fields are left out and a
   * form without fields left is dropped; `blocked` is true when a required image field cannot be left out.
   */
  async adapt(
    socket: AuthenticatedWebSocket,
    forms: FormResponseDto[],
  ): Promise<{ forms: FormResponseDto[]; blocked: boolean }> {
    if (!forms.some((form) => form.fields.some(isImage)) || (await this.supports(socket))) {
      return { forms, blocked: false };
    }
    if (forms.some((form) => form.fields.some((field) => isImage(field) && field.isRequired))) {
      return { forms: [], blocked: true };
    }
    const shown = forms
      .map((form) => ({ ...form, fields: form.fields.filter((field) => !isImage(field)) }))
      .filter((form) => form.fields.length > 0);
    return { forms: shown, blocked: false };
  }

  /** The QR link and count of an image field on screen; a new link when the old one ran out. */
  async describeField(
    socket: AuthenticatedWebSocket,
    where: { resourceId: number; action: ResourceFormAction; formId: number },
    field: FormFieldResponseDto,
  ): Promise<{ handoffUrl: string; imageCount: number; maxImages: number } | null> {
    const userId = socket.state.verifiedUserId;
    if (socket.readerId == null || userId == null) return null;
    const key = this.key(where.resourceId, where.action, where.formId, field.id);
    const view = await this.handoffs.openForReader(
      { readerId: socket.readerId, userId, ...where, fieldId: field.id },
      field.options,
      socket.state.formHandoffs?.[key],
    );
    socket.state.formHandoffs ??= {};
    socket.state.formHandoffs[key] = { handoffId: view.handoffId, token: view.token };
    return { handoffUrl: view.handoffUrl, imageCount: view.imageCount, maxImages: view.maxImages };
  }

  /**
   * The answers of a page with each image field answered by the images the handoff holds: the reader sends no ids,
   * the server knows them. An image field the reader showed but left out of the page counts as empty.
   */
  async fillAnswers(
    socket: AuthenticatedWebSocket,
    where: { resourceId: number; action: ResourceFormAction; formId: number },
    form: FormResponseDto | undefined,
    answers: { fieldId: number; value: FormFieldAnswerValue }[],
  ): Promise<{ fieldId: number; value: FormFieldAnswerValue }[]> {
    const imageFields = form?.fields.filter(isImage) ?? [];
    if (!imageFields.length) return answers;
    const filled = answers.filter((answer) => !imageFields.some((field) => field.id === answer.fieldId));
    for (const field of imageFields) {
      const key = this.key(where.resourceId, where.action, where.formId, field.id);
      const handoff = socket.state.formHandoffs?.[key];
      const sent = answers.some((answer) => answer.fieldId === field.id);
      if (!handoff && !sent) continue;
      const ids = handoff ? await this.handoffs.imageIds(handoff.handoffId) : [];
      filled.push({ fieldId: field.id, value: ids.length ? JSON.stringify(ids) : '' });
    }
    return filled;
  }

  /** Brings the draft answers of image fields up to date: the phone may have removed photos since the page was sent. */
  async refreshDraft(
    socket: AuthenticatedWebSocket,
    where: { resourceId: number; action: ResourceFormAction },
    forms: FormResponseDto[],
    draft: Record<number, FormFieldAnswerValue>,
  ): Promise<void> {
    for (const form of forms) {
      for (const field of form.fields.filter(isImage)) {
        const handoff = socket.state.formHandoffs?.[this.key(where.resourceId, where.action, form.id, field.id)];
        if (!handoff || draft[field.id] === undefined) continue;
        const ids = await this.handoffs.imageIds(handoff.handoffId);
        if (ids.length) draft[field.id] = JSON.stringify(ids);
        else delete draft[field.id];
      }
    }
  }

  /** The form attempt on this resource ended (submitted or cancelled): its phone links stop working. */
  endAttempt(socket: AuthenticatedWebSocket, resourceId: number, action: ResourceFormAction): void {
    if (socket.readerId == null) return;
    if (socket.state.formHandoffs) {
      const prefix = `${resourceId}:${action}:`;
      for (const key of Object.keys(socket.state.formHandoffs)) {
        if (key.startsWith(prefix)) delete socket.state.formHandoffs[key];
      }
    }
    void this.handoffs.endForReader(socket.readerId, { resourceId, action }).catch((error) => {
      this.logger.warn(`Could not end the photo links of reader ${socket.readerId}: ${(error as Error).message}`);
    });
  }

  /** The reader's login ended or changed: every link of the reader stops working. */
  endAllForReader(socket: Pick<AuthenticatedWebSocket, 'readerId'>): void {
    if (socket.readerId == null) return;
    void this.handoffs.endForReader(socket.readerId).catch((error) => {
      this.logger.warn(`Could not end the photo links of reader ${socket.readerId}: ${(error as Error).message}`);
    });
  }
}
