import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { CreateFormDto, UpdateFormDto } from './dto';
import { FormResponseDto } from './dto/form-response.dto';
import { ResourceFormsServiceRouteContext } from './forms.service.route-context';
export abstract class ResourceFormWritingImplementation extends ResourceFormsServiceRouteContext {
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

  protected async ensureResourceExists(resourceId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }
    return resource;
  }

  protected async getFormOrThrow(resourceId: number, formId: number, manager?: EntityManager): Promise<Form> {
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
}
