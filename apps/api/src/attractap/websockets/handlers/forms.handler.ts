import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceFormAction } from '@attraccess/database-entities';
import { AttractapService } from '../../attractap.service';
import { ResourceFormsService } from '../../../resources/forms/forms.service';
import { FormSubmissionRequestDto } from '../../../resources/forms/dto/form-submission-request.dto';
import { ResourceActionGuard } from './resource-action.guard';
import {
  AuthenticatedWebSocket,
  AttractapEvent,
  AttractapEventType,
  FormFieldAnswerValue,
  ResourceUsageFormRequestPayload,
  ResourceUsageFormGetFieldsPayload,
  ResourceUsageFormFieldsPayload,
  ResourceUsageFormSubmitPagePayload,
  ResourceUsageFormCancelPayload,
  ResourceUsageFormPageResultPayload,
} from '../websocket.types';

@Injectable()
export class AttractapFormsHandler {
  private readonly logger = new Logger(AttractapFormsHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceFormsService)
  private resourceFormsService: ResourceFormsService;

  @Inject(ResourceActionGuard)
  private resourceActionGuard: ResourceActionGuard;

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
    if (socket.state.formDrafts) {
      delete socket.state.formDrafts[this.formDraftKey(resourceId, action)];
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
  }: {
    socket: AuthenticatedWebSocket;
    resourceId: number;
    action: ResourceFormAction;
  }): Promise<FormSubmissionRequestDto[] | null> {
    const forms = await this.resourceFormsService.getFormsForAction(resourceId, action);
    if (!forms.length) {
      return [];
    }

    const draft = this.getFormDraft(socket, resourceId, action);
    const hasValue = (fieldId: number) => {
      const value = draft[fieldId];
      return value !== undefined && value !== null && value !== '';
    };

    const complete = forms.every((form) =>
      form.fields.filter((field) => field.isRequired).every((field) => hasValue(field.id)),
    );

    if (complete) {
      return forms.map((form) => ({
        formId: form.id,
        answers: form.fields
          .filter((field) => draft[field.id] !== undefined)
          .map((field) => ({ fieldId: field.id, value: draft[field.id] })),
      }));
    }

    let resourceName: string | undefined;
    try {
      const reader = socket.readerId ? await this.attractapService.findReaderById(socket.readerId) : null;
      const resource = reader?.resources?.find((item) => item.id === resourceId);
      resourceName = resource?.name;
    } catch (error) {
      this.logger.debug(`Failed to resolve resource name for form request: ${(error as Error).message}`);
    }

    const payload: ResourceUsageFormRequestPayload = {
      resourceId,
      resourceName,
      action,
      forms: forms.map((form) => ({ id: form.id, name: form.name, fieldCount: form.fields.length })),
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

    const { totalFieldCount, fields } = await this.resourceFormsService.getFieldsWindow(
      resourceId,
      formId,
      offset,
      limit,
    );

    const draft = this.getFormDraft(socket, resourceId, action);
    const payload: ResourceUsageFormFieldsPayload = {
      resourceId,
      action,
      formId,
      offset,
      totalFieldCount,
      fields: fields.map((field) => ({
        id: field.id,
        name: field.name,
        description: field.description ?? null,
        type: field.type,
        isRequired: field.isRequired,
        options: field.options ?? null,
        value: draft[field.id] ?? null,
      })),
    };

    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_FIELDS, payload));
  }

  public async handleResourceUsageFormSubmitPage(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, action, formId, offset, answers } = data.payload as ResourceUsageFormSubmitPagePayload;

    if (
      !(await this.resourceActionGuard.validateResourceAction(
        socket,
        resourceId,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      ))
    ) {
      return;
    }

    const { valid, errors } = await this.resourceFormsService.validatePageAnswers(resourceId, formId, answers);

    if (valid) {
      const key = this.formDraftKey(resourceId, action);
      socket.state.formDrafts ??= {};
      socket.state.formDrafts[key] ??= {};
      for (const answer of answers) {
        socket.state.formDrafts[key][answer.fieldId] = answer.value;
      }
    }

    const payload: ResourceUsageFormPageResultPayload = { resourceId, action, formId, offset, valid, errors };
    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT, payload));
  }
}
