import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Form, FormField, FormSubmission, Resource, ResourceFormAction } from '@attraccess/database-entities';
import { FormResponseDto } from './dto/form-response.dto';
import {
  CreateFormDto,
  CreateFormFieldDto,
  FormFieldResponseDto,
  FormSubmissionRequestDto,
  UpdateFormDto,
  UpdateFormFieldDto,
} from './dto';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { parseFieldOptions, parseFieldValue } from './forms.validation';

@Injectable()
export class ResourceFormsService {
  private readonly logger = new Logger(ResourceFormsService.name);

  constructor(
    @InjectRepository(Form)
    private readonly formRepository: Repository<Form>,
    @InjectRepository(FormField)
    private readonly formFieldRepository: Repository<FormField>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async findAll(resourceId: number): Promise<FormResponseDto[]> {
    await this.ensureResourceExists(resourceId);
    const forms = await this.formRepository.find({
      where: { resourceId },
      relations: ['fields'],
      order: { name: 'ASC', createdAt: 'ASC' },
    });
    return forms.map((form) => this.mapFormResponse(form));
  }

  async findOne(resourceId: number, formId: number): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getFormOrThrow(resourceId, formId);
    return this.mapFormResponse(form);
  }

  async create(resourceId: number, dto: CreateFormDto): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);

    const form = await this.formRepository.manager.transaction(async (manager) => {
      const formRepo = manager.getRepository(Form);
      const fieldRepo = manager.getRepository(FormField);

      const newForm = formRepo.create({
        resourceId,
        name: dto.name,
        isRequiredOnResourceUsageStart: dto.isRequiredOnResourceUsageStart,
        isRequiredOnResourceUsageTakeOver: dto.isRequiredOnResourceUsageTakeOver,
        isRequiredOnResourceUsageEnd: dto.isRequiredOnResourceUsageEnd,
      });
      const savedForm = await formRepo.save(newForm);

      if (dto.fields?.length) {
        const fieldEntities = dto.fields.map((field) =>
          fieldRepo.create({
            ...this.buildFieldPayload(field),
            formId: savedForm.id,
          }),
        );
        await fieldRepo.save(fieldEntities);
      }

      return this.getFormOrThrow(resourceId, savedForm.id, manager);
    });

    return this.mapFormResponse(form);
  }

  async update(resourceId: number, formId: number, dto: UpdateFormDto): Promise<FormResponseDto> {
    await this.ensureResourceExists(resourceId);

    const form = await this.formRepository.manager.transaction(async (manager) => {
      await this.getFormOrThrow(resourceId, formId, manager);

      const formRepo = manager.getRepository(Form);
      const fieldRepo = manager.getRepository(FormField);

      await formRepo.update(
        { id: formId, resourceId },
        {
          name: dto.name,
          isRequiredOnResourceUsageStart: dto.isRequiredOnResourceUsageStart,
          isRequiredOnResourceUsageTakeOver: dto.isRequiredOnResourceUsageTakeOver,
          isRequiredOnResourceUsageEnd: dto.isRequiredOnResourceUsageEnd,
        },
      );

      const incomingFieldIds = (dto.fields ?? []).map((field) => field.id).filter((id): id is number => !!id);
      if (incomingFieldIds.length) {
        this.logger.debug(`Updating ${incomingFieldIds.length} existing form fields for form #${formId}`);
      }

      const existingFields = await fieldRepo.find({ where: { formId } });
      const existingFieldIds = existingFields.map((field) => field.id);
      const idsToDelete = existingFieldIds.filter((id) => !incomingFieldIds.includes(id));

      if (idsToDelete.length) {
        await fieldRepo.delete(idsToDelete);
      }

      for (const field of dto.fields ?? []) {
        if (field.id) {
          const fieldExists = existingFields.find((existing) => existing.id === field.id);
          if (!fieldExists) {
            throw new NotFoundException(`Form field #${field.id} not found on this form`);
          }
          await fieldRepo.update(field.id, this.buildFieldPayload(field));
        } else {
          await fieldRepo.insert({
            ...this.buildFieldPayload(field),
            formId,
          });
        }
      }

      return this.getFormOrThrow(resourceId, formId, manager);
    });

    return this.mapFormResponse(form);
  }

  async delete(resourceId: number, formId: number): Promise<void> {
    await this.ensureResourceExists(resourceId);

    await this.formRepository.manager.transaction(async (manager) => {
      await this.getFormOrThrow(resourceId, formId, manager);

      const submissionRepo = manager.getRepository(FormSubmission);
      const fieldRepo = manager.getRepository(FormField);
      const formRepo = manager.getRepository(Form);

      await submissionRepo.delete({ formId });
      await fieldRepo.delete({ formId });
      await formRepo.delete({ id: formId, resourceId });
    });
  }

  async getFormsForAction(resourceId: number, action: ResourceFormAction): Promise<FormResponseDto[]> {
    await this.ensureResourceExists(resourceId);
    const forms = await this.getFormsByAction(resourceId, action);
    return forms.map((form) => this.mapFormResponse(form));
  }

  async saveRequiredSubmissions(options: {
    resourceId: number;
    action: ResourceFormAction;
    submissions: FormSubmissionRequestDto[] | undefined;
    userId: number;
    resourceUsageId: number;
    manager: EntityManager;
  }): Promise<void> {
    const forms = await this.getFormsByAction(options.resourceId, options.action, options.manager);

    if (!forms.length) {
      if (options.submissions?.length) {
        this.logger.debug(
          `Received ${options.submissions.length} form submissions for action ${options.action} on resource #${options.resourceId} without required forms. Ignoring.`,
        );
      }
      return;
    }

    const submissionRepo = options.manager.getRepository(FormSubmission);

    for (const form of forms) {
      const submissionsForForm = options.submissions?.filter((item) => item.formId === form.id) ?? [];

      if (submissionsForForm.length > 1) {
        throw new BadRequestException(`Multiple submissions for form "${form.name}" are not allowed.`);
      }

      const submission = submissionsForForm[0];

      if (!submission) {
        throw new BadRequestException(`Form "${form.name}" must be submitted before proceeding.`);
      }

      const data = this.buildSubmissionData(form, submission);

      await submissionRepo.insert({
        formId: form.id,
        resourceUsageId: options.resourceUsageId,
        userId: options.userId,
        data,
        action: options.action,
      });
    }
  }

  private async ensureResourceExists(resourceId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }
    return resource;
  }

  private async getFormOrThrow(resourceId: number, formId: number, manager?: EntityManager): Promise<Form> {
    const repo = manager ? manager.getRepository(Form) : this.formRepository;
    const form = await repo.findOne({
      where: { id: formId, resourceId },
      relations: ['fields'],
    });

    if (!form) {
      throw new NotFoundException(`Form #${formId} not found for resource #${resourceId}`);
    }

    return form;
  }

  private async getFormsByAction(
    resourceId: number,
    action: ResourceFormAction,
    manager?: EntityManager,
  ): Promise<Form[]> {
    const column = this.getActionColumn(action);
    const repo = manager ? manager.getRepository(Form) : this.formRepository;
    const forms = await repo.find({
      where: { resourceId, [column]: true },
      relations: ['fields'],
      order: { createdAt: 'ASC' },
    });
    return forms.map((form) => {
      form.fields = (form.fields ?? []).sort((a, b) => a.id - b.id);
      return form;
    });
  }

  private getActionColumn(action: ResourceFormAction): keyof Form {
    switch (action) {
      case ResourceFormAction.START:
        return 'isRequiredOnResourceUsageStart';
      case ResourceFormAction.TAKEOVER:
        return 'isRequiredOnResourceUsageTakeOver';
      case ResourceFormAction.END:
        return 'isRequiredOnResourceUsageEnd';
      default:
        throw new BadRequestException(`Unsupported form action: ${action}`);
    }
  }

  private buildFieldPayload(field: CreateFormFieldDto | UpdateFormFieldDto) {
    return {
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description ?? null,
      options: parseFieldOptions(field.type, field.options),
    };
  }

  private buildSubmissionData(form: Form, submission: FormSubmissionRequestDto) {
    const data: Record<string, { value: string; fieldDefinition: FormField }> = {};

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

      // For boolean fields, check if it's required and must be true
      if (field.type === 'boolean' && field.isRequired) {
        const boolValue = answer?.value === true || answer?.value === 'true';
        if (!boolValue) {
          throw new BadRequestException(`Field "${field.name}" must be checked on form "${form.name}".`);
        }
      }

      if (!answer || answer.value === undefined || answer.value === null || answer.value === '') {
        if (field.isRequired) {
          throw new BadRequestException(`Field "${field.name}" is required on form "${form.name}".`);
        }
        continue;
      }

      data[field.id.toString()] = {
        value: parseFieldValue(field.type, answer.value, field.options),
        fieldDefinition: field,
      };
    }

    return data;
  }

  private mapFormResponse(form: Form): FormResponseDto {
    const response = new FormResponseDto();
    response.id = form.id;
    response.createdAt = form.createdAt;
    response.updatedAt = form.updatedAt;
    response.name = form.name;
    response.isRequiredOnResourceUsageStart = form.isRequiredOnResourceUsageStart;
    response.isRequiredOnResourceUsageTakeOver = form.isRequiredOnResourceUsageTakeOver;
    response.isRequiredOnResourceUsageEnd = form.isRequiredOnResourceUsageEnd;
    response.resourceId = form.resourceId;
    response.fields = (form.fields ?? []).map((field) => {
      const fieldDto = new FormFieldResponseDto();
      fieldDto.id = field.id;
      fieldDto.name = field.name;
      fieldDto.type = field.type;
      fieldDto.isRequired = field.isRequired;
      fieldDto.description = field.description;
      fieldDto.options = field.options;
      return fieldDto;
    });

    return response;
  }
}
