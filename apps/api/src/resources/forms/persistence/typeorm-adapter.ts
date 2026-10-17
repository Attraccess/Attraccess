import { Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { FormsPersistence, FormActionColumn, FormWrite, FormFieldWrite, FormSubmissionDraft } from './port';

export class TypeormFormsPersistence extends FormsPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async resource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.manager.getRepository(Resource).findOne({ where: { id: resourceId } }));
  }
  async list(resourceId: number): Promise<Form[]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(Form)
        .find({ where: { resourceId }, relations: ['fields'], order: { name: 'ASC', createdAt: 'ASC' } }),
    );
  }
  async required(resourceId: number, column: FormActionColumn): Promise<Form[]> {
    return toApplicationRecord(
      await this.manager
        .getRepository(Form)
        .find({ where: { resourceId, [column]: true }, relations: ['fields'], order: { createdAt: 'ASC' } }),
    );
  }
  async form(resourceId: number, formId: number): Promise<Form | null> {
    return toApplicationRecord(
      await this.manager.getRepository(Form).findOne({ where: { id: formId, resourceId }, relations: ['fields'] }),
    );
  }
  async createForm(data: FormWrite): Promise<Form> {
    const repo = this.manager.getRepository(Form);
    return toApplicationRecord(await repo.save(repo.create(data)));
  }
  async updateForm(resourceId: number, formId: number, data: Omit<FormWrite, 'resourceId'>): Promise<void> {
    await this.manager.getRepository(Form).update({ id: formId, resourceId }, data);
  }
  async fields(formId: number): Promise<FormField[]> {
    return toApplicationRecord(await this.manager.getRepository(FormField).find({ where: { formId } }));
  }
  async insertFields(data: (FormFieldWrite & { formId: number })[]): Promise<void> {
    if (!data.length) return;
    const repo = this.manager.getRepository(FormField);
    // Existing creation saves a batch; additions during update use a single insert.
    await repo.save(data.map((field) => repo.create(field)));
  }
  async insertField(data: FormFieldWrite & { formId: number }): Promise<void> {
    await this.manager.getRepository(FormField).insert(data);
  }
  async updateField(fieldId: number, data: FormFieldWrite): Promise<void> {
    await this.manager.getRepository(FormField).update(fieldId, data);
  }
  async deleteFields(ids: readonly number[]): Promise<void> {
    if (ids.length) await this.manager.getRepository(FormField).delete([...ids]);
  }
  async saveSubmission(data: Omit<FormSubmissionDraft, 'form'>): Promise<FormSubmission> {
    return toApplicationRecord(await this.manager.getRepository(FormSubmission).save(data));
  }
  async deleteFormData(resourceId: number, formId: number): Promise<void> {
    await this.manager.getRepository(FormSubmission).delete({ formId });
    await this.manager.getRepository(FormField).delete({ formId });
    await this.manager.getRepository(Form).delete({ id: formId, resourceId });
  }
}
