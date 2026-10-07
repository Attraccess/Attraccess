import { Form, FormField, ResourceFormAction } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateFormFieldDto, FormFieldResponseDto, UpdateFormFieldDto } from './dto';
import { FormResponseDto } from './dto/form-response.dto';
import { parseFieldOptions } from './forms.validation';
import { ResourceFormSubmissionsImplementation } from './resource-form-submissions';
export abstract class ResourceFormResponseImplementation extends ResourceFormSubmissionsImplementation {
  protected async getFormsByAction(
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
      form.fields = (form.fields ?? []).sort((a, b) => a.position - b.position);
      return form;
    });
  }

  protected getActionColumn(action: ResourceFormAction): keyof Form {
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

  protected buildFieldPayload(field: CreateFormFieldDto | UpdateFormFieldDto) {
    return {
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description ?? null,
      options: parseFieldOptions(field.type, field.options),
      position: field.position,
    };
  }

  protected mapFieldResponse(field: FormField): FormFieldResponseDto {
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

  protected mapFormResponse(form: Form): FormResponseDto {
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
}
