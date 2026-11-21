import type { DataSource, EntityManager } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import {
  Form,
  FormField,
  FormResourceOverride,
  FormSubmission,
  Resource,
  ResourceGroup,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import {
  FormFieldType,
  ResourceFormAction,
  ResourceType,
  ResourceUsageAction,
  type FormScope,
} from '@attraccess/application-models';
import type { FormInput } from '../../../resources/forms/forms-store.port';
import { TypeOrmResourceFormStore } from './resource-form-store.adapter';
import { TypeOrmResourceGroupStore } from './resource-group-store.adapter';
import { ResourceGroupsService } from '../../../resources/groups/resourceGroups.service';
import { ScopedUnitOfWork } from '../../unit-of-work';

const noOverride = {
  disabled: false,
  isRequiredOnResourceUsageStart: null,
  isRequiredOnResourceUsageTakeOver: null,
  isRequiredOnResourceUsageEnd: null,
};

describe('TypeOrmResourceFormStore on real PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmResourceFormStore;
  let resourceId: number;
  let otherResourceId: number;

  const form = (
    name: string,
    start = false,
    placement: { scope?: FormScope; resourceId?: number | null; groupId?: number | null } = {},
  ): FormInput => ({
    name,
    scope: placement.scope ?? 'resource',
    resourceId: placement.resourceId === undefined ? resourceId : placement.resourceId,
    groupId: placement.groupId ?? null,
    isRequiredOnResourceUsageStart: start,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  });
  const global = (name: string, start = false) => form(name, start, { scope: 'global', resourceId: null });
  const group = (name: string, groupId: number, start = false) =>
    form(name, start, { scope: 'group', resourceId: null, groupId });
  const field = (name: string, position: number) => ({
    name,
    type: FormFieldType.TEXT,
    isRequired: false,
    description: null,
    options: null,
    position,
  });
  const ids = (forms: { id: number }[]) => forms.map((item) => item.id);
  const addResource = async (name: string) =>
    (await source.getRepository(Resource).save({ name, type: ResourceType.Machine })).id;
  const addGroup = async (name: string, members: number[]) => {
    const saved = await source.getRepository(ResourceGroup).save({ name });
    for (const member of members) {
      await source.query(
        `INSERT INTO "resource_groups_resource_group" ("resourceId", "resourceGroupId") VALUES ($1, $2)`,
        [member, saved.id],
      );
    }
    return saved.id;
  };
  const submit = async (formId: number, onResource: number, at: string) => {
    const usage = await source.getRepository(ResourceUsage).save({
      resourceId: onResource,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(at),
      endTime: new Date(at),
      isFinalized: true,
    } as unknown as ResourceUsage);
    return (
      await source.getRepository(FormSubmission).save({
        formId,
        userId: 1,
        resourceUsageId: usage.id,
        action: ResourceFormAction.START,
        createdAt: new Date(at),
        data: { '1': { value: 'yes', fieldDefinition: { id: 1, name: 'Q' } } } as never,
      })
    ).id;
  };

  beforeEach(async () => {
    source = await createTestDataSource();
    store = new TypeOrmResourceFormStore(source);
    resourceId = await addResource('Laser');
    otherResourceId = await addResource('Mill');
    await source.getRepository(User).save({ id: 1, username: 'ada', email: 'ada@example.com' } as User);
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('creates a form with its fields, finds it and lists forms by name', async () => {
    await store.createForm(form('Zeta'), []);
    const created = await store.createForm(form('Alpha', true), [field('a', 1), field('b', 0)]);

    expect(created).toMatchObject({ scope: 'resource', resourceId, groupId: null, deletedAt: null });
    expect(created.fields.map((item) => item.name)).toEqual(['b', 'a']);
    expect(created.fields[0]).toMatchObject({ formId: created.id, type: FormFieldType.TEXT, options: null });
    const listed = await store.listForms({ page: 1, limit: 10 });
    expect(listed.total).toBe(2);
    expect(listed.items.map((item) => [item.form.name, item.appliesToResourceCount, item.resourceName])).toEqual([
      ['Alpha', 1, 'Laser'],
      ['Zeta', 1, 'Laser'],
    ]);
    expect(await store.findForm(created.id)).toMatchObject({ name: 'Alpha' });
    expect(await store.resourceExists(resourceId)).toBe(true);
  });

  it('filters and pages the form list and counts the resources each form reaches', async () => {
    const groupId = await addGroup('Lasers', [resourceId, otherResourceId]);
    await addResource('Saw');
    await store.createForm(global('Everywhere'), []);
    const grouped = await store.createForm(group('Grouped', groupId), []);
    await store.createForm(form('Mine'), []);
    await store.upsertOverride(grouped.id, otherResourceId, { ...noOverride, disabled: true });

    const all = await store.listForms({ page: 1, limit: 10 });
    expect(all.items.map((item) => [item.form.name, item.appliesToResourceCount, item.groupName])).toEqual([
      ['Everywhere', 3, null],
      ['Grouped', 1, 'Lasers'],
      ['Mine', 1, null],
    ]);
    expect(ids((await store.listForms({ scope: 'group', page: 1, limit: 10 })).items.map((i) => i.form))).toEqual([
      grouped.id,
    ]);
    expect((await store.listForms({ groupId, page: 1, limit: 10 })).total).toBe(1);
    expect((await store.listForms({ resourceId, page: 1, limit: 10 })).items[0].form.name).toBe('Mine');
    expect((await store.listForms({ search: 'WHERE', page: 1, limit: 10 })).items[0].form.name).toBe('Everywhere');
    const second = await store.listForms({ page: 2, limit: 2 });
    expect([second.total, second.items.map((item) => item.form.name)]).toEqual([3, ['Mine']]);
  });

  it('resolves global, group and resource forms in that order, each by id, and asks a shared form once', async () => {
    const lasers = await addGroup('Lasers', [resourceId]);
    const cutters = await addGroup('Cutters', [resourceId, otherResourceId]);
    const own = await store.createForm(form('Own', true), []);
    const viaBoth = await store.createForm(global('Everywhere', true), []);
    const laserForm = await store.createForm(group('Laser safety', lasers, true), []);
    const cutterForm = await store.createForm(group('Cutter safety', cutters, true), []);
    const secondGlobal = await store.createForm(global('Also everywhere', true), []);
    await store.createForm(form('Other resource', true, { resourceId: otherResourceId }), []);
    await store.createForm(global('Not on start'), []);

    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([
      viaBoth.id,
      secondGlobal.id,
      laserForm.id,
      cutterForm.id,
      own.id,
    ]);
    // The other resource only sees the global forms, the group it is in, and its own form.
    const other = await store.findRequiredForAction(otherResourceId, ResourceFormAction.START);
    expect(other.map((item) => item.name)).toEqual([
      'Everywhere',
      'Also everywhere',
      'Cutter safety',
      'Other resource',
    ]);
    expect(await store.findRequiredForAction(resourceId, ResourceFormAction.END)).toEqual([]);
    const applicable = await store.findApplicableForResource(resourceId);
    expect(applicable.find((item) => item.form.id === cutterForm.id)?.groupName).toBe('Cutters');
    expect(applicable).toHaveLength(6);
  });

  it('a form reached through two groups of the resource appears once', async () => {
    const first = await addGroup('A', [resourceId]);
    await addGroup('B', [resourceId]);
    const shared = await store.createForm(group('Shared', first, true), []);

    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([shared.id]);
  });

  it('switching a form off and overriding flags changes only that resource, and removing it inherits again', async () => {
    const everywhere = await store.createForm(global('Everywhere', false), []);
    const required = await store.createForm(global('Required', true), []);

    await store.upsertOverride(required.id, resourceId, { ...noOverride, disabled: true });
    await store.upsertOverride(everywhere.id, resourceId, { ...noOverride, isRequiredOnResourceUsageStart: true });

    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([everywhere.id]);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.START))).toEqual([required.id]);
    const applicable = await store.findApplicableForResource(resourceId);
    expect(
      applicable.map((item) => [item.form.id, item.disabled, item.effective.isRequiredOnResourceUsageStart]),
    ).toEqual([
      [everywhere.id, false, true],
      [required.id, true, true],
    ]);

    // An override with only null flags inherits the defaults; a second upsert updates the same row.
    await store.upsertOverride(everywhere.id, resourceId, noOverride);
    expect(await source.getRepository(FormResourceOverride).count()).toBe(2);
    expect(await store.deleteOverride(required.id, resourceId)).toBe(true);
    expect(await store.deleteOverride(required.id, resourceId)).toBe(false);
    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([required.id]);
  });

  it('an explicit "not required" override is stored as false and removes a default-required form', async () => {
    const required = await store.createForm(global('Required', true), []);

    await store.upsertOverride(required.id, resourceId, { ...noOverride, isRequiredOnResourceUsageStart: false });

    expect(await store.findRequiredForAction(resourceId, ResourceFormAction.START)).toEqual([]);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.START))).toEqual([required.id]);
    const [row] = await source.getRepository(FormResourceOverride).find();
    expect([row.isRequiredOnResourceUsageStart, row.isRequiredOnResourceUsageEnd]).toEqual([false, null]);
    const [applicable] = await store.findApplicableForResource(resourceId);
    expect(applicable.override?.isRequiredOnResourceUsageStart).toBe(false);
  });

  it('resolves takeover by the takeover flag, its default and its override', async () => {
    const byDefault = await store.createForm(
      { ...global('Default takeover'), isRequiredOnResourceUsageTakeOver: true },
      [],
    );
    const byOverride = await store.createForm(global('Override takeover'), []);
    await store.upsertOverride(byOverride.id, resourceId, { ...noOverride, isRequiredOnResourceUsageTakeOver: true });

    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.TAKEOVER))).toEqual([
      byDefault.id,
      byOverride.id,
    ]);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.TAKEOVER))).toEqual([
      byDefault.id,
    ]);
    expect(await store.findRequiredForAction(resourceId, ResourceFormAction.START)).toEqual([]);
  });

  it('writes an override only for a live form that reaches the resource', async () => {
    const groupId = await addGroup('Lasers', [resourceId]);
    const grouped = await store.createForm(group('Grouped', groupId), []);

    expect(await store.upsertOverride(grouped.id, otherResourceId, { ...noOverride, disabled: true })).toBeNull();
    const saved = await store.upsertOverride(grouped.id, resourceId, { ...noOverride, disabled: true });
    expect(saved).toMatchObject({ formId: grouped.id, resourceId, disabled: true });
    // Concurrent writes of the same override, serialized by the unit of work as the SQLite one does, upsert one row.
    let queue: Promise<unknown> = Promise.resolve();
    const serialized = new ScopedUnitOfWork<EntityManager>({
      transaction: (work) => {
        const run = queue.then(() => source.transaction(work));
        queue = run.catch(() => undefined);
        return run;
      },
    });
    const serializedStore = new TypeOrmResourceFormStore(source, serialized);
    await Promise.all([
      serializedStore.upsertOverride(grouped.id, resourceId, { ...noOverride, isRequiredOnResourceUsageEnd: true }),
      serializedStore.upsertOverride(grouped.id, resourceId, { ...noOverride, isRequiredOnResourceUsageEnd: true }),
    ]);
    expect(await source.getRepository(FormResourceOverride).count()).toBe(1);
    await store.deleteForm(grouped.id);
    expect(await store.upsertOverride(grouped.id, resourceId, noOverride)).toBeNull();
  });

  it('leaves out resource forms of a deleted resource and matches the search literally', async () => {
    await store.createForm(form('Laser form'), []);
    await store.createForm(form('100% safe'), []);
    await store.createForm(form('Mill form', false, { resourceId: otherResourceId }), []);
    await source.getRepository(Resource).softDelete(otherResourceId);

    const listed = await store.listForms({ page: 1, limit: 10 });
    expect([listed.total, listed.items.map((item) => item.form.name)]).toEqual([2, ['100% safe', 'Laser form']]);
    expect((await store.listForms({ search: '%', page: 1, limit: 10 })).items.map((i) => i.form.name)).toEqual([
      '100% safe',
    ]);
    expect((await store.listForms({ search: '_', page: 1, limit: 10 })).total).toBe(0);
  });

  it('lists the resources a form reaches with their overrides', async () => {
    const groupId = await addGroup('Lasers', [resourceId, otherResourceId]);
    const grouped = await store.createForm(group('Grouped', groupId), []);
    await store.upsertOverride(grouped.id, otherResourceId, { ...noOverride, disabled: true });

    const applied = await store.listAppliedResources(grouped.id);

    expect(applied.map((item) => [item.resource.name, item.override?.disabled ?? null])).toEqual([
      ['Laser', null],
      ['Mill', true],
    ]);
    expect(await store.listAppliedResources(999)).toEqual([]);
  });

  it('reconciles retained, deleted and new fields in one transaction', async () => {
    const created = await store.createForm(form('F'), [field('keep', 0), field('drop', 1)]);
    const [keep] = created.fields;

    const result = await store.updateForm(created.id, form('Renamed'), [
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
    const other = await store.createForm(form('Other'), [field('foreign', 0)]);
    const created = await store.createForm(form('F'), [field('mine', 0)]);

    const result = await store.updateForm(created.id, form('Renamed', false, { scope: 'global', resourceId: null }), [
      field('would be added first', 0),
      { id: other.fields[0].id, ...field('foreign', 1) },
    ]);

    expect(result).toEqual({ status: 'field-missing', fieldId: other.fields[0].id });
    const after = await store.findForm(created.id);
    expect(after).toMatchObject({ name: 'F', scope: 'resource' });
    expect(after?.fields.map((item) => item.name)).toEqual(['mine']);
    expect(await store.updateForm(999, form('x'), [])).toEqual({ status: 'form-missing' });
  });

  it('moves a form between scopes keeping its ids and submissions, and drops overrides that left the scope', async () => {
    const groupId = await addGroup('Lasers', [resourceId]);
    const created = await store.createForm(global('Moving', true), [field('q', 0)]);
    const submissionId = await submit(created.id, otherResourceId, '2030-01-01T10:00:00Z');
    await store.upsertOverride(created.id, resourceId, { ...noOverride, isRequiredOnResourceUsageEnd: true });
    await store.upsertOverride(created.id, otherResourceId, { ...noOverride, disabled: true });

    const toGroup = await store.updateForm(created.id, group('Moving', groupId, true), [
      { id: created.fields[0].id, ...field('q', 0) },
    ]);

    expect(toGroup).toMatchObject({ status: 'updated', form: { id: created.id, scope: 'group', groupId } });
    expect(toGroup.status === 'updated' && toGroup.form.fields[0].id).toBe(created.fields[0].id);
    expect((await source.getRepository(FormResourceOverride).find()).map((item) => item.resourceId)).toEqual([
      resourceId,
    ]);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.START))).toEqual([]);

    await store.updateForm(created.id, form('Moving', true, { resourceId: otherResourceId }), [
      { id: created.fields[0].id, ...field('q', 0) },
    ]);
    expect(await source.getRepository(FormResourceOverride).count()).toBe(0);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.START))).toEqual([created.id]);
    expect(ids((await store.listSubmissions(created.id, { page: 1, limit: 10 })).items)).toEqual([submissionId]);
  });

  it('moving a form to global scope keeps every override', async () => {
    const groupId = await addGroup('Lasers', [resourceId]);
    const created = await store.createForm(group('Moving', groupId, true), []);
    await store.upsertOverride(created.id, resourceId, { ...noOverride, disabled: true });

    await store.updateForm(created.id, global('Moving', true), []);

    expect((await source.getRepository(FormResourceOverride).find()).map((item) => item.resourceId)).toEqual([
      resourceId,
    ]);
    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([]);
    expect(ids(await store.findRequiredForAction(otherResourceId, ResourceFormAction.START))).toEqual([created.id]);
  });

  it('the database refuses a scope without exactly the owner it needs', async () => {
    const groupId = await addGroup('Lasers', []);
    const insert = (scope: string, owner: number | null, groupOwner: number | null) =>
      source.query(`INSERT INTO "form" ("name", "scope", "resourceId", "groupId") VALUES ('x', $1, $2, $3)`, [
        scope,
        owner,
        groupOwner,
      ]);

    await expect(insert('resource', null, null)).rejects.toThrow(/CHK_form_scope/);
    await expect(insert('resource', resourceId, groupId)).rejects.toThrow(/CHK_form_scope/);
    await expect(insert('group', null, null)).rejects.toThrow(/CHK_form_scope/);
    await expect(insert('group', resourceId, groupId)).rejects.toThrow(/CHK_form_scope/);
    await expect(insert('global', resourceId, null)).rejects.toThrow(/CHK_form_scope/);
    await expect(insert('anywhere', null, null)).rejects.toThrow(/CHK_form_scope/);
    await insert('global', null, null);
    await insert('group', null, groupId);
    await insert('resource', resourceId, null);
    expect(await source.getRepository(Form).count()).toBe(3);
  });

  it('deletes softly: gone from lists and requirements, fields and submissions kept and readable', async () => {
    const created = await store.createForm(global('F', true), [field('a', 0)]);
    const first = await submit(created.id, resourceId, '2030-01-01T10:00:00Z');
    const second = await submit(created.id, otherResourceId, '2030-01-02T10:00:00Z');
    expect(await store.deleteForm(999)).toBe(false);

    expect(await store.deleteForm(created.id)).toBe(true);
    expect(await store.deleteForm(created.id)).toBe(false);

    expect(await store.findForm(created.id)).toBeNull();
    expect(await store.findFormIncludingDeleted(created.id)).toMatchObject({ id: created.id, fields: [{ name: 'a' }] });
    expect((await store.listForms({ page: 1, limit: 10 })).total).toBe(0);
    expect(await store.findRequiredForAction(resourceId, ResourceFormAction.START)).toEqual([]);
    expect(await store.findApplicableForResource(resourceId)).toEqual([]);
    expect(await store.updateForm(created.id, global('F'), [])).toEqual({ status: 'form-missing' });
    expect(await source.getRepository(FormField).count()).toBe(1);

    const page = await store.listSubmissions(created.id, { page: 1, limit: 10 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.id, item.resource?.name, item.user?.username])).toEqual([
      [second, 'Mill', 'ada'],
      [first, 'Laser', 'ada'],
    ]);
    expect(page.items[0].data['1'].value).toBe('yes');
    const filtered = await store.listSubmissions(created.id, { resourceId, page: 1, limit: 10 });
    expect([filtered.total, ids(filtered.items)]).toEqual([1, [first]]);
    expect(ids((await store.listSubmissions(created.id, { page: 2, limit: 1 })).items)).toEqual([first]);
    // A deleted resource and a deleted user keep their names in the history.
    await source.getRepository(Resource).softDelete(otherResourceId);
    await source.getRepository(User).softDelete(1);
    const afterDelete = await store.listSubmissions(created.id, { page: 1, limit: 10 });
    expect(afterDelete.items.map((item) => [item.resource?.name, item.user?.username])).toEqual([
      ['Mill', 'ada'],
      ['Laser', 'ada'],
    ]);
  });

  it('deleting a resource group deletes its forms softly and keeps their submissions', async () => {
    const groupId = await addGroup('Lasers', [resourceId]);
    const grouped = await store.createForm(group('Grouped', groupId, true), [field('a', 0)]);
    const kept = await store.createForm(global('Kept', true), []);
    await submit(grouped.id, resourceId, '2030-01-01T10:00:00Z');
    // Through the service, which deletes the forms and the group in one unit of work.
    // The in-memory database cannot use the serialized resource connection; one plain transaction is the same unit.
    const unitOfWork = new ScopedUnitOfWork<EntityManager>({ transaction: (work) => source.transaction(work) });
    const formStore = new TypeOrmResourceFormStore(source, unitOfWork);
    const groups = new ResourceGroupsService(
      new TypeOrmResourceGroupStore(source, unitOfWork),
      { emit: jest.fn() } as never,
      { resourceGroupsTotal: { dec: jest.fn() } } as never,
      { record: jest.fn() } as never,
      formStore,
      unitOfWork,
    );

    await groups.deleteOne(groupId);

    expect(await source.getRepository(ResourceGroup).countBy({ id: groupId })).toBe(0);

    expect(ids(await store.findRequiredForAction(resourceId, ResourceFormAction.START))).toEqual([kept.id]);
    const deleted = await store.findFormIncludingDeleted(grouped.id);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(deleted).toMatchObject({ scope: 'group', groupId: null });
    expect((await store.listSubmissions(grouped.id, { page: 1, limit: 10 })).total).toBe(1);
  });
});
