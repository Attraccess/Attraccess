import {
  ResourceFormAction,
  effectiveFormFlags,
  type ApplicableFormRecord,
  type FormFieldRecord,
  type FormRecord,
  type FormRequiredFlags,
  type FormResourceOverrideRecord,
  type UsageFormSubmissionDraft,
  FormFieldType,
  parseFormImageIds,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';

import {
  FormFieldResponseDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
  FormSubmissionRequestDto,
  CreateFormDto,
  UpdateFormDto,
  BaseFormDto,
  FormAppliedResourceDto,
  FormListItemDto,
  FormListQueryDto,
  FormRequiredFlagsDto,
  FormResourceOverrideDto,
  FormSubmissionsQueryDto,
  PaginatedFormSubmissionsResponseDto,
  PaginatedFormsResponseDto,
  ResourceApplicableFormDto,
} from './dto/index';

import { FormResponseDto } from './dto/form-response.dto';

import { isEmptyAnswer, parseFieldOptions, parseFieldValue } from './forms.validation';

import { MissingFormSubmissionException } from './errors/missingFormSubmission.exception';

import { FORM_IMAGE_STORE, type FormImageStore } from './images/form-image-store.port';
import { assertImagesUsable } from './images/form-image-rules';
import { RESOURCE_FORM_STORE, type FormFieldInput, type FormInput, type ResourceFormStore } from './forms-store.port';

import type { TransactionScope } from '../../database/unit-of-work';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

const REQUIRED_FLAG = {
  [ResourceFormAction.START]: 'isRequiredOnResourceUsageStart',
  [ResourceFormAction.TAKEOVER]: 'isRequiredOnResourceUsageTakeOver',
  [ResourceFormAction.END]: 'isRequiredOnResourceUsageEnd',
} as const satisfies Record<ResourceFormAction, keyof FormRequiredFlags>;

@Injectable()
export class ResourceFormsService {
  constructor(
    @Inject(RESOURCE_FORM_STORE) protected readonly store: ResourceFormStore,
    @Inject(FORM_IMAGE_STORE) protected readonly imageStore: FormImageStore,
  ) {}

  protected readonly logger = new Logger(ResourceFormsService.name);

  /** Forms, deleted ones left out, each with the number of resources it currently applies to. */
  async list(query: FormListQueryDto): Promise<PaginatedFormsResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const { items, total } = await this.store.listForms({
      scope: query.scope,
      resourceId: query.resourceId,
      groupId: query.groupId,
      search: query.search,
      page,
      limit,
    });
    return {
      total,
      page,
      limit,
      data: items.map((item) => {
        const dto = Object.assign(new FormListItemDto(), this.mapFormResponse(item.form));
        dto.appliesToResourceCount = item.appliesToResourceCount;
        dto.resourceName = item.resourceName;
        dto.groupName = item.groupName;
        return dto;
      }),
    };
  }

  async findOne(formId: number): Promise<FormResponseDto> {
    return this.mapFormResponse(await this.getFormOrThrow(formId));
  }

  /** The resources the form reaches by its scope, switched-off ones included, with the flags in effect for each. */
  async listAppliedResources(formId: number): Promise<FormAppliedResourceDto[]> {
    const form = await this.getFormOrThrow(formId);
    const applied = await this.store.listAppliedResources(formId);
    return applied.map(({ resource, override }) => ({
      resourceId: resource.id,
      resourceName: resource.name,
      override: override ? this.mapOverride(override) : null,
      disabled: override?.disabled ?? false,
      effective: this.mapFlags(effectiveFormFlags(form, override)),
    }));
  }

  /** Submissions of a form, deleted forms included, newest first. */
  async listSubmissions(formId: number, query: FormSubmissionsQueryDto): Promise<PaginatedFormSubmissionsResponseDto> {
    if (!(await this.store.findFormIncludingDeleted(formId))) {
      throw new NotFoundException(`Form #${formId} not found`);
    }
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const { items, total } = await this.store.listSubmissions(formId, { resourceId: query.resourceId, page, limit });
    return {
      total,
      page,
      limit,
      data: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        action: item.action,
        user: item.user,
        resource: item.resource,
        data: item.data as unknown as Record<string, { value: string; fieldDefinition: Record<string, unknown> }>,
      })),
    };
  }

  /** The forms that reach a resource, its own and inherited ones, switched-off ones included. */
  async listForResource(resourceId: number): Promise<ResourceApplicableFormDto[]> {
    await this.ensureResourceExists(resourceId);
    const applicable = await this.store.findApplicableForResource(resourceId);
    return applicable.map((item) => this.mapApplicable(item));
  }

  async upsertOverride(
    resourceId: number,
    formId: number,
    dto: FormResourceOverrideDto,
  ): Promise<ResourceApplicableFormDto> {
    await this.ensureResourceExists(resourceId);
    await this.getFormOrThrow(formId);
    const saved = await this.store.upsertOverride(formId, resourceId, {
      disabled: dto.disabled,
      isRequiredOnResourceUsageStart: dto.isRequiredOnResourceUsageStart ?? null,
      isRequiredOnResourceUsageTakeOver: dto.isRequiredOnResourceUsageTakeOver ?? null,
      isRequiredOnResourceUsageEnd: dto.isRequiredOnResourceUsageEnd ?? null,
    });
    const applicable = saved ? await this.findApplicable(resourceId, formId) : undefined;
    if (!applicable) {
      throw new BadRequestException(`Form #${formId} does not apply to resource #${resourceId}`);
    }
    return this.mapApplicable(applicable);
  }

  /** Removes the resource's override, so the resource inherits the form's defaults again. */
  async deleteOverride(resourceId: number, formId: number): Promise<void> {
    await this.ensureResourceExists(resourceId);
    await this.getFormOrThrow(formId);
    await this.store.deleteOverride(formId, resourceId);
  }

  private async findApplicable(resourceId: number, formId: number): Promise<ApplicableFormRecord | undefined> {
    return (await this.store.findApplicableForResource(resourceId)).find((item) => item.form.id === formId);
  }

  protected mapApplicable(item: ApplicableFormRecord): ResourceApplicableFormDto {
    return {
      form: this.mapFormResponse(item.form),
      source: item.form.scope,
      groupName: item.groupName,
      override: item.override ? this.mapOverride(item.override) : null,
      disabled: item.disabled,
      effective: this.mapFlags(item.effective),
    };
  }

  protected mapOverride(override: FormResourceOverrideRecord): FormResourceOverrideDto {
    const dto = new FormResourceOverrideDto();
    dto.disabled = override.disabled;
    dto.isRequiredOnResourceUsageStart = override.isRequiredOnResourceUsageStart;
    dto.isRequiredOnResourceUsageTakeOver = override.isRequiredOnResourceUsageTakeOver;
    dto.isRequiredOnResourceUsageEnd = override.isRequiredOnResourceUsageEnd;
    return dto;
  }

  protected mapFlags(flags: FormRequiredFlags): FormRequiredFlagsDto {
    const dto = new FormRequiredFlagsDto();
    dto.isRequiredOnResourceUsageStart = flags.isRequiredOnResourceUsageStart;
    dto.isRequiredOnResourceUsageTakeOver = flags.isRequiredOnResourceUsageTakeOver;
    dto.isRequiredOnResourceUsageEnd = flags.isRequiredOnResourceUsageEnd;
    return dto;
  }

  /**
   * The forms the action requires on the resource. Each carries the flags in effect for this resource (an override
   * wins over the form's default), so the requested action's flag is always true, as before forms were shared.
   */
  async getFormsForAction(resourceId: number, action: ResourceFormAction): Promise<FormResponseDto[]> {
    await this.ensureResourceExists(resourceId);
    this.assertSupportedAction(action);
    const flag = REQUIRED_FLAG[action];
    return (await this.store.findApplicableForResource(resourceId))
      .filter((item) => !item.disabled && item.effective[flag])
      .map((item) => this.mapFormResponse({ ...item.form, ...item.effective }));
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
    action: ResourceFormAction,
    formId: number,
    offset: number,
    limit: number,
    options: { imageFields?: boolean } = {},
  ): Promise<{ totalFieldCount: number; fields: FormFieldResponseDto[] }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getRequiredFormOrThrow(resourceId, action, formId);
    const fields = (form.fields ?? [])
      .filter((field) => options.imageFields !== false || field.type !== FormFieldType.IMAGE)
      .sort((a, b) => a.position - b.position);
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
    response.scope = form.scope;
    response.isRequiredOnResourceUsageStart = form.isRequiredOnResourceUsageStart;
    response.isRequiredOnResourceUsageTakeOver = form.isRequiredOnResourceUsageTakeOver;
    response.isRequiredOnResourceUsageEnd = form.isRequiredOnResourceUsageEnd;
    response.resourceId = form.resourceId;
    response.groupId = form.groupId;
    response.fields = (form.fields ?? [])
      .sort((a, b) => a.position - b.position)
      .map((field) => this.mapFieldResponse(field));

    return response;
  }

  async validatePageAnswers(
    resourceId: number,
    action: ResourceFormAction,
    formId: number,
    answers: { fieldId: number; value: unknown }[],
    userId?: number | null,
  ): Promise<{ valid: boolean; errors: { fieldId: number; message: string; code: string }[] }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getRequiredFormOrThrow(resourceId, action, formId);
    const errors: { fieldId: number; message: string; code: string }[] = [];

    for (const answer of answers) {
      const field = form.fields?.find((item) => item.id === answer.fieldId);
      if (!field) {
        errors.push({ fieldId: answer.fieldId, message: `Unknown field #${answer.fieldId}.`, code: 'UNKNOWN_FIELD' });
        continue;
      }
      try {
        const value = this.validateFieldAnswer(form, field, answer.value);
        if (value !== undefined && field.type === FormFieldType.IMAGE) {
          await this.assertFieldImages(form, field, value, userId);
        }
      } catch (error) {
        // Add stable identifiers for firmware; keep the diagnostic message for
        // existing clients. Field names and values remain separate display data.
        const missingRequired = field.isRequired && (isEmptyAnswer(answer.value) || field.type === 'boolean');
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

      const data = await this.buildSubmissionData(form, submission, options.userId);

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

  protected async buildSubmissionData(form: FormRecord, submission: FormSubmissionRequestDto, userId: number) {
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
      if (field.type === FormFieldType.IMAGE) {
        await this.assertFieldImages(form, field, value, userId);
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

    if (isEmptyAnswer(rawValue)) {
      if (field.isRequired) {
        throw new BadRequestException(`Field "${field.name}" is required on form "${form.name}".`);
      }
      return undefined;
    }

    return parseFieldValue(field.type, rawValue, field.options);
  }

  /** The images an image answer lists must be unattached, uploaded for this field and for the submitting user. */
  protected async assertFieldImages(
    form: FormRecord,
    field: FormFieldRecord,
    value: string,
    userId: number | null | undefined,
  ): Promise<void> {
    if (userId === undefined || userId === null) {
      throw new BadRequestException(`Field "${field.name}" needs a signed-in user.`);
    }
    await assertImagesUsable(this.imageStore, parseFormImageIds(value), {
      userId,
      formId: form.id,
      fieldId: field.id,
      fieldName: field.name,
    });
  }

  /**
   * An image field of a form the action requires on the resource, with the form: what an image upload or a reader
   * handoff needs. 404 when the form does not apply, 400 when the field is not an image field.
   */
  async resolveImageField(
    resourceId: number,
    action: ResourceFormAction,
    formId: number,
    fieldId: number,
  ): Promise<{ form: FormRecord; field: FormFieldRecord; resourceName: string }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getRequiredFormOrThrow(resourceId, action, formId);
    const field = form.fields?.find((item) => item.id === fieldId);
    if (!field) {
      throw new NotFoundException(`Form field #${fieldId} not found on form #${formId}`);
    }
    if (field.type !== FormFieldType.IMAGE) {
      throw new BadRequestException(`Form field #${fieldId} is not an image field.`);
    }
    return { form, field, resourceName: (await this.store.findResourceName(resourceId)) ?? '' };
  }

  async create(dto: CreateFormDto): Promise<FormResponseDto> {
    const form = await this.store.createForm(
      await this.formInput(dto),
      (dto.fields ?? []).map((field) => this.buildFieldPayload(field)),
    );
    return this.mapFormResponse(form);
  }

  /** Changes the form, a move to another scope included; ids of the form and its fields stay. */
  async update(formId: number, dto: UpdateFormDto): Promise<FormResponseDto> {
    const input = await this.formInput(dto);

    const incomingFieldIds = (dto.fields ?? []).map((field) => field.id).filter((id): id is number => !!id);
    if (incomingFieldIds.length) {
      this.logger.debug(`Updating ${incomingFieldIds.length} existing form fields for form #${formId}`);
    }

    const result = await this.store.updateForm(
      formId,
      input,
      (dto.fields ?? []).map((field) => ({ ...this.buildFieldPayload(field), id: field.id })),
    );
    if (result.status === 'form-missing') {
      throw new NotFoundException(`Form #${formId} not found`);
    }
    if (result.status === 'field-missing') {
      throw new NotFoundException(`Form field #${result.fieldId} not found on this form`);
    }

    return this.mapFormResponse(result.form);
  }

  /** Deletes the form softly: it no longer applies anywhere, its fields and submissions stay for the history. */
  async delete(formId: number): Promise<void> {
    if (!(await this.store.deleteForm(formId))) {
      throw new NotFoundException(`Form #${formId} not found`);
    }
  }

  /** Checks that the scope names exactly the owner it needs, and that the owner exists. */
  protected async formInput(dto: BaseFormDto): Promise<FormInput> {
    const resourceId = dto.resourceId ?? null;
    const groupId = dto.groupId ?? null;
    if (dto.scope === 'resource') {
      if (resourceId === null || groupId !== null) {
        throw new BadRequestException('A resource form needs a resourceId and no groupId.');
      }
      await this.ensureResourceExists(resourceId);
    } else if (dto.scope === 'group') {
      if (groupId === null || resourceId !== null) {
        throw new BadRequestException('A group form needs a groupId and no resourceId.');
      }
      if (!(await this.store.groupExists(groupId))) {
        throw new NotFoundException(`Resource group #${groupId} not found`);
      }
    } else if (dto.scope === 'global') {
      if (resourceId !== null || groupId !== null) {
        throw new BadRequestException('A global form has neither a resourceId nor a groupId.');
      }
    } else {
      throw new BadRequestException(`Unsupported form scope: ${String(dto.scope)}`);
    }
    return {
      name: dto.name,
      scope: dto.scope,
      resourceId,
      groupId,
      isRequiredOnResourceUsageStart: dto.isRequiredOnResourceUsageStart,
      isRequiredOnResourceUsageTakeOver: dto.isRequiredOnResourceUsageTakeOver,
      isRequiredOnResourceUsageEnd: dto.isRequiredOnResourceUsageEnd,
    };
  }

  protected async ensureResourceExists(resourceId: number): Promise<void> {
    if (!(await this.store.resourceExists(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }
  }

  protected async getFormOrThrow(formId: number): Promise<FormRecord> {
    const form = await this.store.findForm(formId);

    if (!form) {
      throw new NotFoundException(`Form #${formId} not found`);
    }

    return form;
  }

  /** A form the action requires on the resource: own or inherited, not switched off, required by its flags. */
  protected async getRequiredFormOrThrow(
    resourceId: number,
    action: ResourceFormAction,
    formId: number,
  ): Promise<FormRecord> {
    const form = (await this.getFormsByAction(resourceId, action)).find((item) => item.id === formId);

    if (!form) {
      throw new NotFoundException(`Form #${formId} is not required for ${action} on resource #${resourceId}`);
    }

    return form;
  }
}
