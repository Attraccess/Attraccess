import { DataSource } from 'typeorm';
import { entities, Form, FormField, FormSubmission, Resource } from '@attraccess/database-entities';
import { FormFieldType, ResourceFormAction, ResourceType } from '@attraccess/application-models';
import { TypeOrmResourceFormStore } from './resource-form-store.adapter';

describe('TypeOrmResourceFormStore on real SQLite', () => {
  let source: DataSource;
  let store: TypeOrmResourceFormStore;
  let resourceId: number;

  const form = (name: string, start = false) => ({
    name,
    isRequiredOnResourceUsageStart: start,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  });
  const field = (name: string, position: number) => ({
    name,
    type: FormFieldType.TEXT,
    isRequired: false,
    description: null,
    options: null,
    position,
  });

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: Object.values(entities),
    }).initialize();
    store = new TypeOrmResourceFormStore(source);
    const resources = source.getRepository(Resource);
    resourceId = (await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }))).id;
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('creates a form with its fields and lists forms by name', async () => {
    await store.createForm(resourceId, form('Zeta'), []);
    const created = await store.createForm(resourceId, form('Alpha', true), [field('a', 1), field('b', 0)]);

    expect(created.fields).toHaveLength(2);
    expect(created.fields[0]).toMatchObject({ formId: created.id, type: FormFieldType.TEXT, options: null });
    expect((await store.listForResource(resourceId)).map((item) => item.name)).toEqual(['Alpha', 'Zeta']);
    expect(await store.findForm(resourceId, created.id)).toMatchObject({ name: 'Alpha' });
    expect(await store.findForm(resourceId + 1, created.id)).toBeNull();
    expect(await store.resourceExists(resourceId)).toBe(true);
  });

  it('finds the forms an action requires with fields ordered by position', async () => {
    await store.createForm(resourceId, form('Not required'), []);
    const required = await store.createForm(resourceId, form('Required', true), [field('late', 5), field('early', 1)]);

    const found = await store.findRequiredForAction(resourceId, ResourceFormAction.START);

    expect(found.map((item) => item.id)).toEqual([required.id]);
    expect(found[0].fields.map((item) => item.name)).toEqual(['early', 'late']);
    expect(await store.findRequiredForAction(resourceId, ResourceFormAction.END)).toEqual([]);
  });

  it('reconciles retained, deleted and new fields in one transaction', async () => {
    const created = await store.createForm(resourceId, form('F'), [field('keep', 0), field('drop', 1)]);
    const [keep] = created.fields;

    const result = await store.updateForm(resourceId, created.id, form('Renamed'), [
      { id: keep.id, ...field('kept', 3) },
      field('new', 4),
    ]);

    expect(result.status).toBe('updated');
    const updated = result.status === 'updated' ? result.form : undefined;
    expect(updated?.name).toBe('Renamed');
    expect(updated?.fields.map((item) => item.name).sort()).toEqual(['kept', 'new']);
    expect(updated?.fields.find((item) => item.id === keep.id)).toMatchObject({ name: 'kept', position: 3 });
  });

  it('changes nothing when a field id belongs to another form', async () => {
    const other = await store.createForm(resourceId, form('Other'), [field('foreign', 0)]);
    const created = await store.createForm(resourceId, form('F'), [field('mine', 0)]);

    const result = await store.updateForm(resourceId, created.id, form('Renamed'), [
      field('would be added first', 0),
      { id: other.fields[0].id, ...field('foreign', 1) },
    ]);

    expect(result).toEqual({ status: 'field-missing', fieldId: other.fields[0].id });
    const after = await store.findForm(resourceId, created.id);
    expect(after?.name).toBe('F');
    expect(after?.fields.map((item) => item.name)).toEqual(['mine']);
    expect(await store.updateForm(resourceId, 999, form('x'), [])).toEqual({ status: 'form-missing' });
  });

  it('deletes the form with its fields and submissions together', async () => {
    const created = await store.createForm(resourceId, form('F'), [field('a', 0)]);
    expect(await store.deleteForm(resourceId, 999)).toBe(false);

    expect(await store.deleteForm(resourceId, created.id)).toBe(true);

    expect(await source.getRepository(Form).count()).toBe(0);
    expect(await source.getRepository(FormField).count()).toBe(0);
    expect(await source.getRepository(FormSubmission).count()).toBe(0);
  });
});
