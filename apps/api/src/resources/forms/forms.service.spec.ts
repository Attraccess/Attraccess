import {
  FormFieldType,
  ResourceFormAction,
  type ApplicableFormRecord,
  type FormFieldRecord,
  type FormRecord,
  type FormRequiredFlags,
} from '@attraccess/application-models';
import { ResourceFormsService } from './forms.service';
import type { ResourceFormStore } from './forms-store.port';

const makeField = (overrides: Partial<FormFieldRecord>): FormFieldRecord => ({
  id: 1,
  formId: 7,
  name: 'Field',
  type: FormFieldType.TEXT,
  isRequired: false,
  description: null,
  position: 0,
  options: null,
  ...overrides,
});

const makeStore = (): { [K in keyof ResourceFormStore]: jest.Mock } => ({
  resourceExists: jest.fn().mockResolvedValue(true),
  findResourceName: jest.fn().mockResolvedValue('Laser'),
  groupExists: jest.fn().mockResolvedValue(true),
  listForms: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  findForm: jest.fn().mockResolvedValue(null),
  findFormIncludingDeleted: jest.fn().mockResolvedValue(null),
  findApplicableForResource: jest.fn().mockResolvedValue([]),
  findRequiredForAction: jest.fn().mockResolvedValue([]),
  listAppliedResources: jest.fn().mockResolvedValue([]),
  createForm: jest.fn(),
  updateForm: jest.fn(),
  deleteForm: jest.fn(),
  upsertOverride: jest.fn().mockResolvedValue(null),
  softDeleteGroupForms: jest.fn().mockResolvedValue(0),
  deleteOverride: jest.fn().mockResolvedValue(true),
  listSubmissions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
});

const flags = (start: boolean, takeover: boolean, end: boolean): FormRequiredFlags => ({
  isRequiredOnResourceUsageStart: start,
  isRequiredOnResourceUsageTakeOver: takeover,
  isRequiredOnResourceUsageEnd: end,
});

describe('ResourceFormsService pagination + per-field validation', () => {
  let service: ResourceFormsService;
  let store: ReturnType<typeof makeStore>;

  const form: FormRecord = {
    id: 7,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    name: 'Safety',
    scope: 'resource',
    resourceId: 5,
    groupId: null,
    deletedAt: null,
    isRequiredOnResourceUsageStart: true,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
    fields: [
      makeField({ id: 11, name: 'Name', type: FormFieldType.TEXT, isRequired: true }),
      makeField({ id: 12, name: 'Age', type: FormFieldType.NUMBER, isRequired: false }),
      makeField({ id: 13, name: 'Confirm', type: FormFieldType.BOOLEAN, isRequired: true }),
      makeField({ id: 14, name: 'Color', type: FormFieldType.SELECT, isRequired: true, options: ['red', 'blue'] }),
    ].map((field, position) => ({ ...field, position })),
  };

  beforeEach(() => {
    store = makeStore();
    store.findForm.mockResolvedValue(form);
    store.findRequiredForAction.mockResolvedValue([form]);
    service = new ResourceFormsService(store as never, {} as never);
  });

  it('returns form metadata with field counts', async () => {
    const meta = await service.getFormMetaForAction(5, ResourceFormAction.START);
    expect(meta).toEqual([{ id: 7, name: 'Safety', fieldCount: 4 }]);
  });

  it('returns a windowed slice of fields ordered by id with total count', async () => {
    const page = await service.getFieldsWindow(5, ResourceFormAction.START, 7, 1, 1);
    expect(page.totalFieldCount).toBe(4);
    expect(page.fields).toHaveLength(1);
    expect(page.fields[0].id).toBe(12);
  });

  it('accepts a valid single-field answer', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 11, value: 'Alice' }]);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an empty required field', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 11, value: '' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(11);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD');
  });

  it('rejects a non-numeric number field', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 12, value: 'abc' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(12);
    expect(result.errors[0].code).toBe('INVALID_NUMBER');
  });

  it('rejects an unchecked required boolean', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 13, value: false }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(13);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD');
  });

  it('rejects a select value outside the configured options', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 14, value: 'green' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(14);
    expect(result.errors[0].code).toBe('INVALID_SELECTION');
  });

  it('accepts an in-range select value', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 14, value: 'blue' }]);
    expect(result.valid).toBe(true);
  });

  it('flags an unknown field id', async () => {
    const result = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [{ fieldId: 999, value: 'x' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(999);
    expect(result.errors[0].code).toBe('UNKNOWN_FIELD');
  });

  it('serves fields and validates pages only for a form the action requires on the resource', async () => {
    await expect(service.getFieldsWindow(5, ResourceFormAction.END, 8, 0, 1)).rejects.toThrow(
      'Form #8 is not required for end on resource #5',
    );
    await expect(
      service.validatePageAnswers(5, ResourceFormAction.START, 8, [{ fieldId: 11, value: 'x' }]),
    ).rejects.toThrow('is not required');
    expect(store.findRequiredForAction).toHaveBeenCalledWith(5, ResourceFormAction.END, undefined);
  });

  it('validates lifecycle form drafts without publishing submissions', async () => {
    const scope = { isOpen: true, afterCommit: jest.fn() };
    const drafts = await service.prepareRequiredSubmissions({
      resourceId: 5,
      action: ResourceFormAction.START,
      userId: 3,
      resourceUsageId: 9,
      scope,
      submissions: [
        {
          formId: 7,
          answers: [
            { fieldId: 11, value: 'Alice' },
            { fieldId: 13, value: true },
            { fieldId: 14, value: 'blue' },
          ],
        },
      ],
    });
    expect(store.findRequiredForAction).toHaveBeenCalledWith(5, ResourceFormAction.START, scope);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ resourceUsageId: 9, userId: 3, formId: 7 });
    expect(drafts[0].data['11'].value).toBe('Alice');
    expect(drafts[0].data['11'].fieldDefinition).toMatchObject({ id: 11, name: 'Name' });
    expect(store.createForm).not.toHaveBeenCalled();
  });

  it('refuses an unsupported action before touching the store', async () => {
    await expect(
      service.prepareRequiredSubmissions({
        resourceId: 5,
        action: 'nope' as never,
        userId: 3,
        resourceUsageId: 9,
        submissions: [],
      }),
    ).rejects.toThrow('Unsupported form action');
    expect(store.findRequiredForAction).not.toHaveBeenCalled();
  });

  it('asks for a submission of every required form and refuses duplicates', async () => {
    await expect(
      service.prepareRequiredSubmissions({
        resourceId: 5,
        action: ResourceFormAction.START,
        userId: 3,
        resourceUsageId: 9,
        submissions: [],
      }),
    ).rejects.toThrow('MissingFormSubmissionException');
    const answer = { formId: 7, answers: [] };
    await expect(
      service.prepareRequiredSubmissions({
        resourceId: 5,
        action: ResourceFormAction.START,
        userId: 3,
        resourceUsageId: 9,
        submissions: [answer, answer],
      }),
    ).rejects.toThrow('Multiple submissions');
  });

  it('ignores submissions when no form is required', async () => {
    store.findRequiredForAction.mockResolvedValue([]);
    expect(
      await service.prepareRequiredSubmissions({
        resourceId: 5,
        action: ResourceFormAction.END,
        userId: 3,
        resourceUsageId: 9,
        submissions: [{ formId: 7, answers: [] }],
      }),
    ).toEqual([]);
  });
});

describe('ResourceFormsService form writes', () => {
  const defaults = {
    name: 'Updated',
    scope: 'resource' as const,
    resourceId: 5,
    isRequiredOnResourceUsageStart: false,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  };
  const stored: FormRecord = {
    id: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...defaults,
    groupId: null,
    deletedAt: null,
    fields: [makeField({ id: 11, position: 1 }), makeField({ id: 10, position: 0 })],
  };
  let store: ReturnType<typeof makeStore>;
  let service: ResourceFormsService;

  beforeEach(() => {
    store = makeStore();
    service = new ResourceFormsService(store as never, {} as never);
  });

  it('hands the form and its validated fields to the store as one create and sorts the response fields', async () => {
    store.createForm.mockResolvedValue(stored);
    const created = await service.create({
      ...defaults,
      fields: [{ name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false }],
    });
    expect(store.createForm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated', scope: 'resource', resourceId: 5, groupId: null }),
      [{ name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false, description: null, options: null }],
    );
    expect(created.fields.map((field) => field.id)).toEqual([10, 11]);
  });

  it('passes retained and new fields of an update to the store in one call', async () => {
    store.updateForm.mockResolvedValue({ status: 'updated', form: stored });
    const updated = await service.update(7, {
      ...defaults,
      fields: [
        { id: 11, name: 'Retained', type: FormFieldType.TEXT, position: 0, isRequired: true },
        { name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false },
      ],
    });
    expect(updated.name).toBe('Updated');
    expect(store.updateForm).toHaveBeenCalledTimes(1);
    expect(store.updateForm).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Updated' }), [
      expect.objectContaining({ id: 11, name: 'Retained', isRequired: true }),
      expect.objectContaining({ id: undefined, name: 'New' }),
    ]);
  });

  it('rejects an existing field belonging to a different form', async () => {
    store.updateForm.mockResolvedValue({ status: 'field-missing', fieldId: 99 });
    await expect(
      service.update(7, {
        ...defaults,
        fields: [{ id: 99, name: 'Foreign', type: FormFieldType.TEXT, position: 0, isRequired: false }],
      }),
    ).rejects.toThrow('Form field #99 not found on this form');
  });

  it('reports a missing form on update and delete, and a missing resource or group of the scope', async () => {
    store.updateForm.mockResolvedValue({ status: 'form-missing' });
    await expect(service.update(8, { ...defaults, fields: [] })).rejects.toThrow('Form #8 not found');
    store.deleteForm.mockResolvedValue(false);
    await expect(service.delete(8)).rejects.toThrow('Form #8 not found');
    store.resourceExists.mockResolvedValue(false);
    await expect(service.create({ ...defaults, fields: [] })).rejects.toThrow('ResourceNotFoundException');
    store.groupExists.mockResolvedValue(false);
    await expect(
      service.create({ ...defaults, scope: 'group', resourceId: null, groupId: 3, fields: [] }),
    ).rejects.toThrow('Resource group #3 not found');
    expect(store.createForm).not.toHaveBeenCalled();
  });

  it.each([
    ['resource', { resourceId: null, groupId: null }],
    ['resource', { resourceId: 5, groupId: 3 }],
    ['group', { resourceId: null, groupId: null }],
    ['group', { resourceId: 5, groupId: 3 }],
    ['global', { resourceId: 5, groupId: null }],
    ['global', { resourceId: null, groupId: 3 }],
    ['elsewhere', { resourceId: null, groupId: null }],
  ])('rejects a %s form with %o', async (scope, owners) => {
    await expect(service.create({ ...defaults, ...owners, scope: scope as never, fields: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.update(7, { ...defaults, ...owners, scope: scope as never, fields: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.createForm).not.toHaveBeenCalled();
    expect(store.updateForm).not.toHaveBeenCalled();
  });

  it('stores group and global forms with only the owner their scope needs', async () => {
    store.createForm.mockResolvedValue(stored);
    await service.create({ ...defaults, scope: 'group', resourceId: undefined, groupId: 3, fields: [] });
    await service.create({ ...defaults, scope: 'global', resourceId: null, groupId: null, fields: [] });
    expect(store.createForm.mock.calls.map(([input]) => [input.scope, input.resourceId, input.groupId])).toEqual([
      ['group', null, 3],
      ['global', null, null],
    ]);
  });

  it('sends an empty field list through so the store removes all fields', async () => {
    store.updateForm.mockResolvedValue({ status: 'updated', form: stored });
    await service.update(7, { ...defaults, fields: [] });
    expect(store.updateForm).toHaveBeenCalledWith(7, expect.anything(), []);
  });

  it('deletes through the store', async () => {
    store.deleteForm.mockResolvedValue(true);
    await expect(service.delete(7)).resolves.toBeUndefined();
    expect(store.deleteForm).toHaveBeenCalledWith(7);
  });
});

describe('ResourceFormsService forms of a resource', () => {
  const formOf = (id: number, overrides: Partial<FormRecord> = {}): FormRecord => ({
    id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    name: `Form ${id}`,
    scope: 'global',
    resourceId: null,
    groupId: null,
    deletedAt: null,
    ...flags(false, false, true),
    fields: [],
    ...overrides,
  });
  const applicable = (form: FormRecord, overrides: Partial<ApplicableFormRecord> = {}): ApplicableFormRecord => ({
    form,
    groupName: null,
    override: null,
    disabled: false,
    effective: flags(
      form.isRequiredOnResourceUsageStart,
      form.isRequiredOnResourceUsageTakeOver,
      form.isRequiredOnResourceUsageEnd,
    ),
    ...overrides,
  });
  let store: ReturnType<typeof makeStore>;
  let service: ResourceFormsService;

  beforeEach(() => {
    store = makeStore();
    service = new ResourceFormsService(store as never, {} as never);
  });

  it('lists own and inherited forms with their source, override and effective flags', async () => {
    const override = {
      id: 1,
      formId: 2,
      resourceId: 5,
      disabled: true,
      isRequiredOnResourceUsageStart: true,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    store.findApplicableForResource.mockResolvedValue([
      applicable(formOf(1)),
      applicable(formOf(2, { scope: 'group', groupId: 3 }), {
        groupName: 'Lasers',
        override,
        disabled: true,
        effective: flags(true, false, true),
      }),
    ]);

    const forms = await service.listForResource(5);

    expect(forms.map((item) => [item.form.id, item.source, item.groupName, item.disabled])).toEqual([
      [1, 'global', null, false],
      [2, 'group', 'Lasers', true],
    ]);
    expect(forms[1].override).toEqual({
      disabled: true,
      isRequiredOnResourceUsageStart: true,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
    });
    expect(forms[1].effective).toEqual(flags(true, false, true));
  });

  it('stores an override only for a form that reaches the resource and passes null flags through', async () => {
    store.findForm.mockResolvedValue(formOf(9));
    // The store checks the reach and writes in one transaction; null means the form does not reach the resource.
    store.upsertOverride.mockResolvedValueOnce(null);
    await expect(
      service.upsertOverride(5, 9, {
        disabled: false,
        isRequiredOnResourceUsageStart: null,
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageEnd: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.findApplicableForResource).not.toHaveBeenCalled();

    store.upsertOverride.mockResolvedValueOnce({ id: 1 });
    store.findApplicableForResource.mockResolvedValue([applicable(formOf(9))]);
    await expect(service.upsertOverride(5, 9, { disabled: true } as never)).resolves.toMatchObject({
      form: { id: 9 },
    });
    expect(store.upsertOverride).toHaveBeenCalledWith(9, 5, {
      disabled: true,
      isRequiredOnResourceUsageStart: null,
      isRequiredOnResourceUsageTakeOver: null,
      isRequiredOnResourceUsageEnd: null,
    });
  });

  it('reports requirements with the flags in effect for the resource, so the action flag is always true', async () => {
    // Default: not required on start; this resource overrides it to required. A switched-off form is left out.
    store.findApplicableForResource.mockResolvedValue([
      applicable(formOf(1, flags(false, false, true)), { effective: flags(true, false, true) }),
      applicable(formOf(2, flags(true, false, false)), { disabled: true }),
      applicable(formOf(3, flags(false, false, false))),
    ]);

    const forms = await service.getFormsForAction(5, ResourceFormAction.START);

    expect(
      forms.map((form) => [form.id, form.isRequiredOnResourceUsageStart, form.isRequiredOnResourceUsageEnd]),
    ).toEqual([[1, true, true]]);
    await expect(service.getFormsForAction(5, 'nope' as never)).rejects.toThrow('Unsupported form action');
  });

  it('removes an override of an existing form and refuses missing forms and resources', async () => {
    store.findForm.mockResolvedValue(formOf(9));
    await service.deleteOverride(5, 9);
    expect(store.deleteOverride).toHaveBeenCalledWith(9, 5);
    store.findForm.mockResolvedValue(null);
    await expect(service.deleteOverride(5, 10)).rejects.toThrow('Form #10 not found');
    store.resourceExists.mockResolvedValue(false);
    await expect(service.listForResource(6)).rejects.toThrow();
  });

  it('lists the resources a form reaches with the flags in effect for each', async () => {
    store.findForm.mockResolvedValue(formOf(9));
    store.listAppliedResources.mockResolvedValue([
      { resource: { id: 1, name: 'Laser' }, override: null },
      {
        resource: { id: 2, name: 'Mill' },
        override: {
          id: 4,
          formId: 9,
          resourceId: 2,
          disabled: false,
          isRequiredOnResourceUsageStart: true,
          isRequiredOnResourceUsageTakeOver: null,
          isRequiredOnResourceUsageEnd: false,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      },
    ]);

    const resources = await service.listAppliedResources(9);

    expect(resources.map((item) => [item.resourceName, item.disabled, item.effective])).toEqual([
      ['Laser', false, flags(false, false, true)],
      ['Mill', false, flags(true, false, false)],
    ]);
  });

  it('pages submissions of deleted forms too and clamps the page size', async () => {
    store.findFormIncludingDeleted.mockResolvedValue(formOf(9, { deletedAt: new Date() }));
    store.listSubmissions.mockResolvedValue({ items: [], total: 0 });
    expect(await service.listSubmissions(9, { page: 2, limit: 500, resourceId: 4 })).toEqual({
      data: [],
      total: 0,
      page: 2,
      limit: 100,
    });
    expect(store.listSubmissions).toHaveBeenCalledWith(9, { resourceId: 4, page: 2, limit: 100 });
    store.findFormIncludingDeleted.mockResolvedValue(null);
    await expect(service.listSubmissions(10, { page: 1, limit: 10 })).rejects.toThrow('Form #10 not found');
  });

  it('lists forms with their reach and owner names', async () => {
    store.listForms.mockResolvedValue({
      total: 1,
      items: [{ form: formOf(1), appliesToResourceCount: 12, resourceName: null, groupName: null }],
    });
    const page = await service.list({ page: 1, limit: 10, scope: 'global', search: 'safe' });
    expect(store.listForms).toHaveBeenCalledWith(expect.objectContaining({ scope: 'global', search: 'safe' }));
    expect(page.data[0]).toMatchObject({ id: 1, scope: 'global', appliesToResourceCount: 12 });
    expect(page.total).toBe(1);
  });
});
