import { Form, FormField, FormSubmission, Resource, ResourceFormAction } from '@attraccess/database-entities';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormFieldResponseDto } from './dto';
import { FormResponseDto } from './dto/form-response.dto';
import { ResourceFormResponseImplementation } from './resource-form-response';

@Injectable()
export class ResourceFormsService extends ResourceFormResponseImplementation {
  protected readonly logger = new Logger(ResourceFormsService.name);

  constructor(
    @InjectRepository(Form)
    protected readonly formRepository: Repository<Form>,
    @InjectRepository(FormField)
    protected readonly formFieldRepository: Repository<FormField>,
    @InjectRepository(FormSubmission)
    protected readonly formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
  ) {
    super();
  }

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
}
