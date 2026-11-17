import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { ResourceFormAction, type FormFieldRecord, type FormRecord } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type {
  FormFieldInput,
  FormFieldUpdate,
  FormInput,
  FormUpdateResult,
  ResourceFormStore,
} from '../../../resources/forms/forms-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';

const toFieldRecord = (field: FormField): FormFieldRecord => ({
  id: field.id,
  formId: field.formId,
  name: field.name,
  type: field.type,
  isRequired: field.isRequired,
  description: field.description,
  position: field.position,
  options: field.options,
});

const toFormRecord = (form: Form): FormRecord => ({
  id: form.id,
  createdAt: form.createdAt,
  updatedAt: form.updatedAt,
  name: form.name,
  isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
  isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
  isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
  resourceId: form.resourceId,
  fields: (form.fields ?? []).map(toFieldRecord),
});

const REQUIRED_COLUMN = {
  [ResourceFormAction.START]: 'isRequiredOnResourceUsageStart',
  [ResourceFormAction.TAKEOVER]: 'isRequiredOnResourceUsageTakeOver',
  [ResourceFormAction.END]: 'isRequiredOnResourceUsageEnd',
} as const;

/** Rolls the update transaction back for a field id that is not a field of the form. */
class FieldMissingRollback extends Error {
  constructor(readonly fieldId: number) {
    super(`Form field #${fieldId} not found on this form`);
  }
}

@Injectable()
export class TypeOrmResourceFormStore implements ResourceFormStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(context?: ResourcePersistenceContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async listForResource(resourceId: number): Promise<FormRecord[]> {
    const forms = await this.dataSource.getRepository(Form).find({
      where: { resourceId },
      relations: ['fields'],
      order: { name: 'ASC', createdAt: 'ASC' },
    });
    return forms.map(toFormRecord);
  }

  async findForm(resourceId: number, formId: number, context?: ResourcePersistenceContext): Promise<FormRecord | null> {
    const form = await this.manager(context)
      .getRepository(Form)
      .findOne({ where: { id: formId, resourceId }, relations: ['fields'] });
    return form ? toFormRecord(form) : null;
  }

  async findRequiredForAction(
    resourceId: number,
    action: ResourceFormAction,
    context?: ResourcePersistenceContext,
  ): Promise<FormRecord[]> {
    const column = REQUIRED_COLUMN[action];
    const forms = await this.manager(context)
      .getRepository(Form)
      .find({ where: { resourceId, [column]: true }, relations: ['fields'], order: { createdAt: 'ASC' } });
    return forms.map(toFormRecord).map((form) => ({
      ...form,
      fields: [...form.fields].sort((a, b) => a.position - b.position),
    }));
  }

  async createForm(resourceId: number, form: FormInput, fields: FormFieldInput[]): Promise<FormRecord> {
    const createdId = await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(Form);
      const saved = await formRepo.save(formRepo.create({ resourceId, ...this.formColumns(form) }));
      if (fields.length) {
        const fieldRepo = manager.getRepository(FormField);
        await fieldRepo.save(fields.map((field) => fieldRepo.create({ ...field, formId: saved.id })));
      }
      return saved.id;
    });
    return this.reload(resourceId, createdId);
  }

  async updateForm(
    resourceId: number,
    formId: number,
    form: FormInput,
    fields: FormFieldUpdate[],
  ): Promise<FormUpdateResult> {
    try {
      const found = await this.dataSource.transaction(async (manager) => {
        const formRepo = manager.getRepository(Form);
        const fieldRepo = manager.getRepository(FormField);
        if (!(await formRepo.findOne({ where: { id: formId, resourceId } }))) return false;

        await formRepo.update({ id: formId, resourceId }, this.formColumns(form));

        const incomingIds = fields.map((field) => field.id).filter((id): id is number => !!id);
        const existing = await fieldRepo.find({ where: { formId } });
        const idsToDelete = existing.map((field) => field.id).filter((id) => !incomingIds.includes(id));
        if (idsToDelete.length) await fieldRepo.delete(idsToDelete);

        for (const { id, ...payload } of fields) {
          if (!id) {
            await fieldRepo.insert({ ...payload, formId });
          } else if (existing.some((field) => field.id === id)) {
            await fieldRepo.update(id, payload);
          } else {
            throw new FieldMissingRollback(id);
          }
        }
        return true;
      });
      if (!found) return { status: 'form-missing' };
    } catch (error) {
      if (error instanceof FieldMissingRollback) return { status: 'field-missing', fieldId: error.fieldId };
      throw error;
    }
    return { status: 'updated', form: await this.reload(resourceId, formId) };
  }

  async deleteForm(resourceId: number, formId: number): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      if (!(await manager.getRepository(Form).findOne({ where: { id: formId, resourceId } }))) return false;
      await manager.getRepository(FormSubmission).delete({ formId });
      await manager.getRepository(FormField).delete({ formId });
      await manager.getRepository(Form).delete({ id: formId, resourceId });
      return true;
    });
  }

  private formColumns(form: FormInput) {
    return {
      name: form.name,
      isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
      isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
      isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    };
  }

  private async reload(resourceId: number, formId: number): Promise<FormRecord> {
    const form = await this.dataSource
      .getRepository(Form)
      .findOneOrFail({ where: { id: formId, resourceId }, relations: ['fields'] });
    return toFormRecord(form);
  }
}
