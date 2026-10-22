import { formsOperationsFake } from './persistence/operations.test-fixture';
import { DatabaseTransactions } from '../../database/transaction-scope';
import { FormsPersistence } from './persistence/port';
import { Test } from '@nestjs/testing';
import { Form, FormField, FormFieldType, Resource, ResourceFormAction } from '@attraccess/application-models';
import { ResourceFormsService } from './forms.service';

const makeField = (overrides: Partial<FormField>): FormField =>
  ({
    id: 1,
    formId: 1,
    name: 'Field',
    type: FormFieldType.TEXT,
    isRequired: false,
    description: null,
    options: null,
    ...overrides,
  }) as FormField;

describe('ResourceFormsService pagination + per-field validation', () => {
  let service: ResourceFormsService;
  let fake: ReturnType<typeof formsOperationsFake>;

  const form: Form = {
    id: 7,
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
    ],
  } as Form;

  beforeEach(async () => {
    jest.clearAllMocks();
    fake = formsOperationsFake();
    fake.persistence.resource.mockResolvedValue({ id: 5 } as Resource);
    fake.persistence.form.mockResolvedValue(form);
    fake.persistence.list.mockResolvedValue([form]);
    fake.persistence.required.mockResolvedValue([form]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFormsService,
        { provide: FormsPersistence, useValue: fake.persistence },
        { provide: DatabaseTransactions, useValue: fake.transactions },
      ],
    }).compile();

    service = moduleRef.get(ResourceFormsService);
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
    const drafts = await fake.transactions.run({ resourceIds: [5], accountIds: [3] }, (scope) =>
      service.prepareRequiredSubmissions({
        resourceId: 5,
        action: ResourceFormAction.START,
        userId: 3,
        resourceUsageId: 9,
        manager: scope,
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
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ resourceUsageId: 9, userId: 3, formId: 7 });
    expect(drafts[0].data['11'].value).toBe('Alice');
    expect(fake.persistence.saveSubmission).not.toHaveBeenCalled();
  });
});

describe('ResourceFormsService field updates', () => {
  const defaults = {
    name: 'Updated',
    isRequiredOnResourceUsageStart: false,
    isRequiredOnResourceUsageTakeOver: false,
    isRequiredOnResourceUsageEnd: false,
  };
  const makeService = () => {
    const form = { id: 7, resourceId: 5, name: 'Updated', fields: [] };
    const fake = formsOperationsFake();
    fake.persistence.resource.mockResolvedValue({ id: 5 } as Resource);
    fake.persistence.form.mockResolvedValue(form as Form);
    fake.persistence.fields.mockResolvedValue([{ id: 11 }, { id: 12 }] as FormField[]);
    const service = new ResourceFormsService(fake.persistence, fake.transactions);
    return { service, persistence: fake.persistence, driver: fake.driver };
  };

  it('reconciles retained, deleted and new fields within the form transaction', async () => {
    const { service, persistence, driver } = makeService();
    const updated = await service.update(5, 7, {
      ...defaults,
      name: 'Updated',
      fields: [
        { id: 11, name: 'Retained', type: FormFieldType.TEXT, position: 0, isRequired: true },
        { name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false },
      ],
    });
    expect(updated.name).toBe('Updated');
    expect(driver.run).toHaveBeenCalledWith({ resourceIds: [5], accountIds: [] }, expect.any(Function));
    expect(persistence.deleteFields).toHaveBeenCalledWith([12]);
    expect(persistence.updateField).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ name: 'Retained', isRequired: true }),
    );
    expect(persistence.insertField).toHaveBeenCalledWith(expect.objectContaining({ formId: 7, name: 'New' }));
  });

  it('rejects an existing field belonging to a different form', async () => {
    const { service, persistence } = makeService();
    await expect(
      service.update(5, 7, {
        ...defaults,
        fields: [{ id: 99, name: 'Foreign', type: FormFieldType.TEXT, position: 0, isRequired: false }],
      }),
    ).rejects.toThrow('Form field #99 not found on this form');
    expect(persistence.updateField).not.toHaveBeenCalled();
    expect(persistence.insertField).not.toHaveBeenCalled();
  });

  it('removes all fields when the update supplies an empty field list', async () => {
    const { service, persistence } = makeService();
    await service.update(5, 7, { ...defaults, fields: [] });
    expect(persistence.deleteFields).toHaveBeenCalledWith([11, 12]);
    expect(persistence.updateField).not.toHaveBeenCalled();
  });
});
