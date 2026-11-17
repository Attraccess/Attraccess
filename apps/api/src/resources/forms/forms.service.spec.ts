import {
  FormFieldType,
  ResourceFormAction,
  type FormFieldRecord,
  type FormRecord,
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
  listForResource: jest.fn().mockResolvedValue([]),
  findForm: jest.fn().mockResolvedValue(null),
  findRequiredForAction: jest.fn().mockResolvedValue([]),
  createForm: jest.fn(),
  updateForm: jest.fn(),
  deleteForm: jest.fn(),
});

describe('ResourceFormsService pagination + per-field validation', () => {
  let service: ResourceFormsService;
  let store: ReturnType<typeof makeStore>;

  const form: FormRecord = {
    id: 7,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    name: 'Safety',
    resourceId: 5,
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
    service = new ResourceFormsService(store as never);
  });

  it('returns form metadata with field counts', async () => {
    const meta = await service.getFormMetaForAction(5, ResourceFormAction.START);
    expect(meta).toEqual([{ id: 7, name: 'Safety', fieldCount: 4 }]);
  });

  it('returns a windowed slice of fields ordered by id with total count', async () => {
    const page = await service.getFieldsWindow(5, 7, 1, 1);
    expect(page.totalFieldCount).toBe(4);
    expect(page.fields).toHaveLength(1);
    expect(page.fields[0].id).toBe(12);
  });

  it('accepts a valid single-field answer', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 11, value: 'Alice' }]);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an empty required field', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 11, value: '' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(11);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD');
  });

  it('rejects a non-numeric number field', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 12, value: 'abc' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(12);
    expect(result.errors[0].code).toBe('INVALID_NUMBER');
  });

  it('rejects an unchecked required boolean', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 13, value: false }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(13);
    expect(result.errors[0].code).toBe('REQUIRED_FIELD');
  });

  it('rejects a select value outside the configured options', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 14, value: 'green' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(14);
    expect(result.errors[0].code).toBe('INVALID_SELECTION');
  });

  it('accepts an in-range select value', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 14, value: 'blue' }]);
    expect(result.valid).toBe(true);
  });

  it('flags an unknown field id', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 999, value: 'x' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(999);
    expect(result.errors[0].code).toBe('UNKNOWN_FIELD');
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
    isRequiredOnResourceUsageStart: false,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  };
  const stored: FormRecord = {
    id: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceId: 5,
    ...defaults,
    fields: [makeField({ id: 11, position: 1 }), makeField({ id: 10, position: 0 })],
  };
  let store: ReturnType<typeof makeStore>;
  let service: ResourceFormsService;

  beforeEach(() => {
    store = makeStore();
    service = new ResourceFormsService(store as never);
  });

  it('hands the form and its validated fields to the store as one create and sorts the response fields', async () => {
    store.createForm.mockResolvedValue(stored);
    const created = await service.create(5, {
      ...defaults,
      fields: [{ name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false }],
    });
    expect(store.createForm).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Updated' }), [
      { name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false, description: null, options: null },
    ]);
    expect(created.fields.map((field) => field.id)).toEqual([10, 11]);
  });

  it('passes retained and new fields of an update to the store in one call', async () => {
    store.updateForm.mockResolvedValue({ status: 'updated', form: stored });
    const updated = await service.update(5, 7, {
      ...defaults,
      fields: [
        { id: 11, name: 'Retained', type: FormFieldType.TEXT, position: 0, isRequired: true },
        { name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false },
      ],
    });
    expect(updated.name).toBe('Updated');
    expect(store.updateForm).toHaveBeenCalledTimes(1);
    expect(store.updateForm).toHaveBeenCalledWith(5, 7, expect.objectContaining({ name: 'Updated' }), [
      expect.objectContaining({ id: 11, name: 'Retained', isRequired: true }),
      expect.objectContaining({ id: undefined, name: 'New' }),
    ]);
  });

  it('rejects an existing field belonging to a different form', async () => {
    store.updateForm.mockResolvedValue({ status: 'field-missing', fieldId: 99 });
    await expect(
      service.update(5, 7, {
        ...defaults,
        fields: [{ id: 99, name: 'Foreign', type: FormFieldType.TEXT, position: 0, isRequired: false }],
      }),
    ).rejects.toThrow('Form field #99 not found on this form');
  });

  it('reports a missing form on update and delete, and a missing resource everywhere', async () => {
    store.updateForm.mockResolvedValue({ status: 'form-missing' });
    await expect(service.update(5, 8, { ...defaults, fields: [] })).rejects.toThrow(
      'Form #8 not found for resource #5',
    );
    store.deleteForm.mockResolvedValue(false);
    await expect(service.delete(5, 8)).rejects.toThrow('Form #8 not found for resource #5');
    store.resourceExists.mockResolvedValue(false);
    await expect(service.delete(5, 7)).rejects.toThrow();
    await expect(service.create(5, { ...defaults, fields: [] })).rejects.toThrow();
  });

  it('sends an empty field list through so the store removes all fields', async () => {
    store.updateForm.mockResolvedValue({ status: 'updated', form: stored });
    await service.update(5, 7, { ...defaults, fields: [] });
    expect(store.updateForm).toHaveBeenCalledWith(5, 7, expect.anything(), []);
  });

  it('deletes through the store', async () => {
    store.deleteForm.mockResolvedValue(true);
    await expect(service.delete(5, 7)).resolves.toBeUndefined();
    expect(store.deleteForm).toHaveBeenCalledWith(5, 7);
  });
});
