import { Form, FormField, FormSubmission, Resource, ResourceFormAction } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { CreateFormFieldDto, FormFieldResponseDto, FormSubmissionRequestDto, UpdateFormFieldDto } from './dto';
import { FormResponseDto } from './dto/form-response.dto';
import type { ResourceFormsService } from './forms.service';

export abstract class ResourceFormsServiceRouteContext {
  protected abstract ensureResourceExists(resourceId: number): Promise<Resource>;
  protected abstract readonly formRepository: Repository<Form>;
  protected abstract buildFieldPayload(field: CreateFormFieldDto | UpdateFormFieldDto): {
    name: string;
    type: import('@attraccess/database-entities').FormFieldType;
    isRequired: boolean;
    description: string;
    options: import('./form-field-option-schemas').FieldOptionsPayload;
    position: number;
  };
  protected abstract getFormOrThrow(resourceId: number, formId: number, manager?: EntityManager): Promise<Form>;
  protected abstract mapFormResponse(form: Form): FormResponseDto;
  protected abstract readonly logger: Logger;
  protected abstract validateFieldAnswer(form: Form, field: FormField, rawValue: unknown): string | undefined;
  public abstract prepareRequiredSubmissions(
    options: Parameters<ResourceFormsService['saveRequiredSubmissions']>[0],
  ): Promise<FormSubmission[]>;
  protected abstract getFormsByAction(
    resourceId: number,
    action: ResourceFormAction,
    manager?: EntityManager,
  ): Promise<Form[]>;
  protected abstract buildSubmissionData(
    form: Form,
    submission: FormSubmissionRequestDto,
  ): Record<string, { value: string; fieldDefinition: FormField }>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract getActionColumn(action: ResourceFormAction): keyof Form;
  protected abstract mapFieldResponse(field: FormField): FormFieldResponseDto;
}
