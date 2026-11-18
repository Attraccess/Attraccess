import {
  ResourceFormAction,
  type FormFieldRecord,
  type FormRecord,
  type UsageFormSubmissionDraft,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';

import {
  FormFieldResponseDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
  FormSubmissionRequestDto,
  CreateFormDto,
  UpdateFormDto,
} from './dto/index';

import { FormResponseDto } from './dto/form-response.dto';

import { parseFieldOptions, parseFieldValue } from './forms.validation';

import { MissingFormSubmissionException } from './errors/missingFormSubmission.exception';

import { RESOURCE_FORM_STORE, type FormFieldInput, type ResourceFormStore } from './forms-store.port';

import type { TransactionScope } from '../../database/unit-of-work';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

@Injectable()
export class ResourceFormsService {
  constructor(@Inject(RESOURCE_FORM_STORE) protected readonly store: ResourceFormStore) {}

  protected readonly logger = new Logger(ResourceFormsService.name);

  async findAll(resourceId: number): Promise<FormResponseDto[]> {
    await this.ensureResourceExists(resourceId);
    const forms = await this.store.listForResource(resourceId);
    return forms.map((form) => this.mapFormResponse(form));
  }

  async findOne(resourceId: number, formId: number): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getFormOrThrow(resourceId, formId);
    return this.mapFormResponse(form);
  }

  async getFormsForAction(resourceId: number, action: ResourceFormAction): Promise<FormResponseDto[]> {
    await this.ensureResourceExists(resourceId);
    const forms = await this.getFormsByAction(resourceId, action);
    return forms.map((form) => this.mapFormResponse(form));
  }

  async getFormMetaForAction(
    resourceId: number,
    action: ResourceFormAction,
  ): Promise<{ id: number; name: string; fieldCount: number }[]> {
    await this.ensureResourceExists(resourceId);
    const forms = await this.getFormsByAction(resourceId, action);
    return forms.map((form) => ({ id: form.id, name: form.name, fieldCount: (form.fields ?? []).length }));
  }

  async getFieldsWindow(
    resourceId: number,
    formId: number,
    offset: number,
    limit: number,
  ): Promise<{ totalFieldCount: number; fields: FormFieldResponseDto[] }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getFormOrThrow(resourceId, formId);
    const fields = (form.fields ?? []).sort((a, b) => a.position - b.position);
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.max(1, limit);
    const window = fields.slice(safeOffset, safeOffset + safeLimit).map((field) => this.mapFieldResponse(field));
    return { totalFieldCount: fields.length, fields: window };
  }

  protected async getFormsByAction(
    resourceId: number,
    action: ResourceFormAction,
    scope?: TransactionScope,
  ): Promise<FormRecord[]> {
    this.assertSupportedAction(action);
    return this.store.findRequiredForAction(resourceId, action, scope);
  }

  protected assertSupportedAction(action: ResourceFormAction): void {
    if (![ResourceFormAction.START, ResourceFormAction.TAKEOVER, ResourceFormAction.END].includes(action)) {
      throw new BadRequestException(`Unsupported form action: ${action}`);
    }
  }

  protected buildFieldPayload(field: CreateFormFieldDto | UpdateFormFieldDto): FormFieldInput {
    return {
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description ?? null,
      options: parseFieldOptions(field.type, field.options),
      position: field.position,
    };
  }

  protected mapFieldResponse(field: FormFieldRecord): FormFieldResponseDto {
    const fieldDto = new FormFieldResponseDto();
    fieldDto.id = field.id;
    fieldDto.name = field.name;
    fieldDto.type = field.type;
    fieldDto.isRequired = field.isRequired;
    fieldDto.description = field.description;
    fieldDto.options = field.options;
    fieldDto.position = field.position;
    return fieldDto;
  }

  protected mapFormResponse(form: FormRecord): FormResponseDto {
    const response = new FormResponseDto();
    response.id = form.id;
    response.createdAt = form.createdAt;
    response.updatedAt = form.updatedAt;
    response.name = form.name;
    response.isRequiredOnResourceUsageStart = form.isRequiredOnResourceUsageStart;
    response.isRequiredOnResourceUsageTakeOver = form.isRequiredOnResourceUsageTakeOver;
    response.isRequiredOnResourceUsageEnd = form.isRequiredOnResourceUsageEnd;
    response.resourceId = form.resourceId;
    response.fields = (form.fields ?? [])
      .sort((a, b) => a.position - b.position)
      .map((field) => this.mapFieldResponse(field));

    return response;
  }

  async validatePageAnswers(
    resourceId: number,
    formId: number,
    answers: { fieldId: number; value: unknown }[],
  ): Promise<{ valid: boolean; errors: { fieldId: number; message: string; code: string }[] }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getFormOrThrow(resourceId, formId);
    const errors: { fieldId: number; message: string; code: string }[] = [];

    for (const answer of answers) {
      const field = form.fields?.find((item) => item.id === answer.fieldId);
      if (!field) {
        errors.push({ fieldId: answer.fieldId, message: `Unknown field #${answer.fieldId}.`, code: 'UNKNOWN_FIELD' });
        continue;
      }
      try {
        this.validateFieldAnswer(form, field, answer.value);
      } catch (error) {
        // Add stable identifiers for firmware; keep the diagnostic message for
        // existing clients. Field names and values remain separate display data.
        const missingRequired =
          field.isRequired &&
          (answer.value === undefined || answer.value === null || answer.value === '' || field.type === 'boolean');
        const code = missingRequired
          ? 'REQUIRED_FIELD'
          : field.type === 'number'
            ? 'INVALID_NUMBER'
            : field.type === 'select'
              ? 'INVALID_SELECTION'
              : 'INVALID_INPUT';
        errors.push({ fieldId: field.id, message: (error as Error).message, code });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** Validate and snapshot answers before external lifecycle effects, without publishing submissions. */
  async prepareRequiredSubmissions(options: {
    resourceId: number;
    action: ResourceFormAction;
    submissions: FormSubmissionRequestDto[] | undefined;
    userId: number;
    resourceUsageId: number;
    /** The unit of work of the lifecycle step the forms are validated in. */
    scope?: TransactionScope;
  }): Promise<UsageFormSubmissionDraft[]> {
    const forms = await this.getFormsByAction(options.resourceId, options.action, options.scope);

    if (!forms.length) {
      if (options.submissions?.length) {
        this.logger.debug(
          `Received ${options.submissions.length} form submissions for action ${options.action} on resource #${options.resourceId} without required forms. Ignoring.`,
        );
      }
      return [];
    }

    const drafts: UsageFormSubmissionDraft[] = [];

    for (const form of forms) {
      const submissionsForForm = options.submissions?.filter((item) => item.formId === form.id) ?? [];

      if (submissionsForForm.length > 1) {
        throw new BadRequestException(`Multiple submissions for form "${form.name}" are not allowed.`);
      }

      const submission = submissionsForForm[0];

      if (!submission) {
        throw new MissingFormSubmissionException(form.name);
      }

      const data = this.buildSubmissionData(form, submission);

      drafts.push({
        formId: form.id,
        form,
        resourceUsageId: options.resourceUsageId,
        userId: options.userId,
        data,
        action: options.action,
      });
    }

    return drafts;
  }

  protected buildSubmissionData(form: FormRecord, submission: FormSubmissionRequestDto) {
    const data: Record<string, { value: string; fieldDefinition: FormFieldRecord }> = {};

    const unknownField = submission.answers.find(
      (answer) => !form.fields?.some((field) => field.id === answer.fieldId),
    );
    if (unknownField) {
      throw new BadRequestException(
        `Answer provided for unknown field #${unknownField.fieldId} on form "${form.name}".`,
      );
    }

    for (const field of form.fields ?? []) {
      const answer = submission.answers.find((item) => item.fieldId === field.id);
      const value = this.validateFieldAnswer(form, field, answer?.value);
      if (value === undefined) {
        continue;
      }
      data[field.id.toString()] = { value, fieldDefinition: field };
    }

    return data;
  }

  protected validateFieldAnswer(form: FormRecord, field: FormFieldRecord, rawValue: unknown): string | undefined {
    if (field.type === 'boolean' && field.isRequired) {
      const boolValue = rawValue === true || rawValue === 'true';
      if (!boolValue) {
        throw new BadRequestException(`Field "${field.name}" must be checked on form "${form.name}".`);
      }
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (field.isRequired) {
        throw new BadRequestException(`Field "${field.name}" is required on form "${form.name}".`);
      }
      return undefined;
    }

    return parseFieldValue(field.type, rawValue, field.options);
  }

  async create(resourceId: number, dto: CreateFormDto): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);

    const form = await this.store.createForm(
      resourceId,
      dto,
      (dto.fields ?? []).map((field) => this.buildFieldPayload(field)),
    );

    return this.mapFormResponse(form);
  }

  async update(resourceId: number, formId: number, dto: UpdateFormDto): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);

    const incomingFieldIds = (dto.fields ?? []).map((field) => field.id).filter((id): id is number => !!id);
    if (incomingFieldIds.length) {
      this.logger.debug(`Updating ${incomingFieldIds.length} existing form fields for form #${formId}`);
    }

    const result = await this.store.updateForm(
      resourceId,
      formId,
      dto,
      (dto.fields ?? []).map((field) => ({ ...this.buildFieldPayload(field), id: field.id })),
    );
    if (result.status === 'form-missing') {
      throw new NotFoundException(`Form #${formId} not found for resource #${resourceId}`);
    }
    if (result.status === 'field-missing') {
      throw new NotFoundException(`Form field #${result.fieldId} not found on this form`);
    }

    return this.mapFormResponse(result.form);
  }

  async delete(resourceId: number, formId: number): Promise<void> {
    await this.ensureResourceExists(resourceId);

    if (!(await this.store.deleteForm(resourceId, formId))) {
      throw new NotFoundException(`Form #${formId} not found for resource #${resourceId}`);
    }
  }

  protected async ensureResourceExists(resourceId: number): Promise<void> {
    if (!(await this.store.resourceExists(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }
  }

  protected async getFormOrThrow(resourceId: number, formId: number): Promise<FormRecord> {
    const form = await this.store.findForm(resourceId, formId);

    if (!form) {
      throw new NotFoundException(`Form #${formId} not found for resource #${resourceId}`);
    }

    return form;
  }
}
