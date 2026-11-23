import { Inject, Injectable, Logger } from '@nestjs/common';
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import { FormImageHandoffService } from '../../../../resources/forms/images/form-image-handoff.service';
import type { FormResponseDto } from '../../../../resources/forms/dto/form-response.dto';
import type { FormFieldResponseDto } from '../../../../resources/forms/dto/form-field.dto';
import type { AuthenticatedWebSocket, FormFieldAnswerValue } from '../../websocket.types';

const isImage = (field: Pick<FormFieldResponseDto, 'type'>) => field.type === FormFieldType.IMAGE;

/**
 * Image fields on readers (ATT-879). A reader with `capabilities.formImages` shows an image field as the QR code of a
 * phone handoff; older readers never get the field type: optional image fields are left out, a required one stops
 * the action with a message that points to the web app.
 */
@Injectable()
export class ReaderFormImages {
  private readonly logger = new Logger(ReaderFormImages.name);
  /** The latest `describeField` call per reader and field; the next one waits for it. */
  private readonly lanes = new Map<string, Promise<unknown>>();

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
    const readerId = socket.readerId;
    const key = this.key(where.resourceId, where.action, where.formId, field.id);
    // One call at a time per reader and field: the firmware's prefetch, render and 3 s poll can overlap, and two
    // calls that both find no usable link would each create one, leaving the phone on a link the reader does not show.
    const lane = `${readerId}:${key}`;
    const previous = this.lanes.get(lane) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const view = await this.handoffs.openForReader(
          { readerId, userId, ...where, fieldId: field.id },
          field.options,
          socket.state.formHandoffs?.[key],
        );
        socket.state.formHandoffs ??= {};
        socket.state.formHandoffs[key] = { handoffId: view.handoffId, token: view.token };
        return { handoffUrl: view.handoffUrl, imageCount: view.imageCount, maxImages: view.maxImages };
      });
    this.lanes.set(lane, run);
    try {
      return await run;
    } finally {
      if (this.lanes.get(lane) === run) this.lanes.delete(lane);
    }
  }

  /**
   * The answers of a page with each image field of that page answered by the images the handoff holds: the reader
   * sends no ids, the server knows them. An image field on the page that the reader left out counts as empty. An image
   * field on another page is left alone (its handoff may exist only because the reader prefetched that page), or its
   * required error would block a page that does not show it.
   */
  async fillAnswers(
    socket: AuthenticatedWebSocket,
    where: { resourceId: number; action: ResourceFormAction; formId: number },
    form: FormResponseDto | undefined,
    answers: { fieldId: number; value: FormFieldAnswerValue }[],
    offset: number,
  ): Promise<{ fieldId: number; value: FormFieldAnswerValue }[]> {
    const imageFields = form?.fields.filter(isImage) ?? [];
    if (!imageFields.length) return answers;
    // The reader shows one field per page, in position order (the field window of `getFieldsWindow`).
    const pageFieldId = (await this.supports(socket))
      ? [...(form?.fields ?? [])].sort((a, b) => a.position - b.position)[Math.max(0, offset)]?.id
      : undefined;
    const filled = answers.filter((answer) => !imageFields.some((field) => field.id === answer.fieldId));
    for (const field of imageFields) {
      const key = this.key(where.resourceId, where.action, where.formId, field.id);
      const handoff = socket.state.formHandoffs?.[key];
      const sent = answers.some((answer) => answer.fieldId === field.id);
      if (!sent && (!handoff || field.id !== pageFieldId)) continue;
      const ids = handoff ? await this.handoffs.imageIds(handoff.handoffId) : [];
      filled.push({ fieldId: field.id, value: ids.length ? JSON.stringify(ids) : '' });
    }
    return filled;
  }

  /**
   * Brings the draft answers of image fields up to date from their handoffs: the phone may have removed photos since
   * the page was sent, or finished an upload after the user went past an optional photo page with none. A submit
   * always passes every page, so a photo that arrived late belongs to the answer.
   */
  async refreshDraft(
    socket: AuthenticatedWebSocket,
    where: { resourceId: number; action: ResourceFormAction },
    forms: FormResponseDto[],
    draft: Record<number, FormFieldAnswerValue>,
  ): Promise<void> {
    for (const form of forms) {
      for (const field of form.fields.filter(isImage)) {
        const handoff = socket.state.formHandoffs?.[this.key(where.resourceId, where.action, form.id, field.id)];
        if (!handoff) continue;
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
  endAllForReader(readerId: number | null | undefined): void {
    if (readerId == null) return;
    void this.handoffs.endForReader(readerId).catch((error) => {
      this.logger.warn(`Could not end the photo links of reader ${readerId}: ${(error as Error).message}`);
    });
  }

  /**
   * A reader connection closed: only the links it issued stop working. A newer connection of the same reader (maybe on
   * another API instance) keeps its own.
   */
  endIssued(handoffIds: string[]): void {
    if (!handoffIds.length) return;
    void this.handoffs.endHandoffs(handoffIds).catch((error) => {
      this.logger.warn(`Could not end the photo links of a closed reader connection: ${(error as Error).message}`);
    });
  }
}
