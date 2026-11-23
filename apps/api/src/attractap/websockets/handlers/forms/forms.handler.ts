import { Inject, Injectable, Logger } from '@nestjs/common';
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import { AttractapService } from '../../../attractap.service';
import { ResourceFormsService } from '../../../../resources/forms/forms.service';
import { FormSubmissionRequestDto } from '../../../../resources/forms/dto/form-submission-request.dto';
import { ResourceActionGuard } from '../resource-action.guard';
import { ReaderFormImages } from './reader-form-images.service';
import { hostReason } from '../../../../plugin-system/reader-ui/host-texts';
import type { FormResponseDto } from '../../../../resources/forms/dto/form-response.dto';
import {
  AuthenticatedWebSocket,
  AttractapEvent,
  forgetReaderFormState,
  AttractapEventType,
  FormFieldAnswerValue,
  ResourceUsageFormRequestPayload,
  ResourceUsageFormGetFieldsPayload,
  ResourceUsageFormFieldsPayload,
  ResourceUsageFormSubmitPagePayload,
  ResourceUsageFormCancelPayload,
  ResourceUsageFormPageResultPayload,
} from '../../websocket.types';

/** The firmware shows at most this many forms per RESOURCE_USAGE_FORM_REQUEST and drops the rest. */
export const MAX_FORMS_PER_READER_REQUEST = 4;

@Injectable()
export class AttractapFormsHandler {
  private readonly logger = new Logger(AttractapFormsHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceFormsService)
  private resourceFormsService: ResourceFormsService;

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

  @Inject(ReaderFormImages)
  private readerImages: ReaderFormImages;

  private formDraftKey(resourceId: number, action: ResourceFormAction): string {
    return `${resourceId}:${action}`;
  }

  public getFormDraft(
    socket: AuthenticatedWebSocket,
    resourceId: number,
    action: ResourceFormAction,
  ): Record<number, FormFieldAnswerValue> {
    return socket.state.formDrafts?.[this.formDraftKey(resourceId, action)] ?? {};
  }

  public clearFormDraft(socket: AuthenticatedWebSocket, resourceId: number, action: ResourceFormAction): void {
    const key = this.formDraftKey(resourceId, action);
    if (socket.state.formDrafts) {
      delete socket.state.formDrafts[key];
    }
    if (socket.state.formsPresented) {
      delete socket.state.formsPresented[key];
    }
    // The attempt is over, submitted or not: the phone links of its image fields stop working.
    this.readerImages.endAttempt(socket, resourceId, action);
  }

  /**
   * The reader's login ended or changed, or its connection closed: the form answers, the forms shown and the phone
   * links of image fields (ATT-879) all go. A login change or sign-out ends every link of the reader; a closed
   * connection only the links it issued, since a newer connection of the same reader may already have its own.
   * `readerId` names the reader when the socket no longer does.
   */
  public endReaderForms(
    socket: AuthenticatedWebSocket,
    options: { connectionClosed?: boolean; readerId?: number | null } = {},
  ): void {
    const issued = Object.values(socket.state.formHandoffs ?? {}).map((handoff) => handoff.handoffId);
    forgetReaderFormState(socket);
    if (options.connectionClosed) {
      this.readerImages.endIssued(issued);
    } else {
      this.readerImages.endAllForReader(options.readerId === undefined ? socket.readerId : options.readerId);
    }
  }

  public handleResourceUsageFormCancel(socket: AuthenticatedWebSocket, data: AttractapEvent['data']): void {
    const { resourceId, action } = data.payload as ResourceUsageFormCancelPayload;
    this.clearFormDraft(socket, resourceId, action);
  }

  public async ensureFormsSatisfied({
    socket,
    resourceId,
    action,
    requestId,
    reject,
  }: {
    socket: AuthenticatedWebSocket;
    resourceId: number;
    action: ResourceFormAction;
    requestId?: number;
    /** Answers the pending action with an error, for a form this reader can never complete. */
    reject: (payload: { error: string; reason: unknown }) => Promise<unknown>;
  }): Promise<FormSubmissionRequestDto[] | null> {
    const allForms = await this.resourceFormsService.getFormsForAction(resourceId, action);
    if (!allForms.length) {
      return [];
    }

    // Readers that cannot show image fields never get them (ATT-879): optional ones are left out, a required one
    // makes the action fail with a pointer to the web app.
    const adapted = await this.readerImages.adapt(socket, allForms);
    if (adapted.blocked) {
      const language = socket.state.cardSession?.language;
      await reject({ error: 'START_BLOCKED', reason: hostReason('FORM_PHOTO_UNSUPPORTED', language) });
      return null;
    }
    const forms = adapted.forms;

    const key = this.formDraftKey(resourceId, action);
    const draft = this.getFormDraft(socket, resourceId, action);
    await this.readerImages.refreshDraft(socket, { resourceId, action }, forms, draft);
    const hasValue = (fieldId: number) => {
      const value = draft[fieldId];
      return value !== undefined && value !== null && value !== '';
    };
    const answered = (form: FormResponseDto) =>
      form.fields.filter((field) => field.isRequired).every((field) => hasValue(field.id));
    const presented = new Set(socket.state.formsPresented?.[key] ?? []);

    // Before the reader was asked for anything, answers that already cover every required field are enough, as they
    // always were. Once it was asked, every form must have been shown and answered: the reader shows at most four
    // forms per request, so the rest follow in further requests.
    const pending = forms.filter((form) => !(presented.has(form.id) && answered(form)));
    const complete = presented.size === 0 ? forms.every(answered) : pending.length === 0;

    if (complete) {
      return allForms.map((form) => ({
        formId: form.id,
        answers: form.fields
          .filter((field) => draft[field.id] !== undefined)
          .map((field) => ({ fieldId: field.id, value: draft[field.id] })),
      }));
    }

    const batch = pending.slice(0, MAX_FORMS_PER_READER_REQUEST);
    socket.state.formsPresented ??= {};
    socket.state.formsPresented[key] = [...presented, ...batch.map((form) => form.id)];

    let resourceName: string | undefined;
    try {
      const reader = socket.readerId ? await this.attractapService.findReaderById(socket.readerId) : null;
      const resource = reader?.resources?.find((item) => item.id === resourceId);
      resourceName = resource?.name;
    } catch (error) {
      this.logger.debug(`Failed to resolve resource name for form request: ${(error as Error).message}`);
    }

    const payload: ResourceUsageFormRequestPayload = {
      ...(Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {}),
      resourceId,
      resourceName,
      action,
      forms: batch.map((form) => ({ id: form.id, name: form.name, fieldCount: form.fields.length })),
    };

    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST, payload));
    return null;
  }

  public async handleResourceUsageFormGetFields(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, action, formId, offset, limit } = data.payload as ResourceUsageFormGetFieldsPayload;

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      ))
    ) {
      return;
    }

    const imageFields = await this.readerImages.supports(socket);
    const { totalFieldCount, fields } = await this.resourceFormsService.getFieldsWindow(
      resourceId,
      action,
      formId,
      offset,
      limit,
      { imageFields },
    );

    const draft = this.getFormDraft(socket, resourceId, action);
    const where = { resourceId, action, formId };
    const payload: ResourceUsageFormFieldsPayload = {
      resourceId,
      action,
      formId,
      offset,
      totalFieldCount,
      fields: await Promise.all(
        fields.map(async (field) => ({
          id: field.id,
          name: field.name,
          description: field.description ?? null,
          type: field.type,
          isRequired: field.isRequired,
          options: field.options ?? null,
          // The ids of an image answer stay on the server: the reader shows a link and a count instead.
          value: field.type === FormFieldType.IMAGE ? null : (draft[field.id] ?? null),
          ...(field.type === FormFieldType.IMAGE ? await this.readerImages.describeField(socket, where, field) : {}),
        })),
      ),
    };

    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_FIELDS, payload));
  }

  public async handleResourceUsageFormSubmitPage(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, action, formId, offset, answers } = data.payload as ResourceUsageFormSubmitPagePayload;
    // Answers belong to the user who gave them: a new login while they are checked must not inherit them.
    const userId = socket.state.verifiedUserId;

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      ))
    ) {
      return;
    }

    const where = { resourceId, action, formId };
    const form = (await this.resourceFormsService.getFormsForAction(resourceId, action)).find(
      (item) => item.id === formId,
    );
    // The reader sends no image ids: the answer of an image field is what the phone handoff holds.
    const filled = await this.readerImages.fillAnswers(socket, where, form, answers, offset);
    const checked = await this.resourceFormsService.validatePageAnswers(resourceId, action, formId, filled, userId);
    // Saved only for the user who answered; if the login changed meanwhile, the reader must not be
    // told the page was accepted (START would then miss the answers).
    const stillSameUser = userId != null && socket.state.verifiedUserId === userId;
    const valid = checked.valid && stillSameUser;
    const errors = checked.errors;

    if (valid) {
      const key = this.formDraftKey(resourceId, action);
      socket.state.formDrafts ??= {};
      socket.state.formDrafts[key] ??= {};
      for (const answer of filled) {
        if (
          answer.value === '' &&
          form?.fields.some((f) => f.id === answer.fieldId && f.type === FormFieldType.IMAGE)
        ) {
          delete socket.state.formDrafts[key][answer.fieldId];
          continue;
        }
        socket.state.formDrafts[key][answer.fieldId] = answer.value;
      }
    }

    const payload: ResourceUsageFormPageResultPayload = { resourceId, action, formId, offset, valid, errors };
    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT, payload));
  }
}
