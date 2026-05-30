import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Form, FormField, FormFieldType, FormSubmission, Resource, ResourceFormAction } from '@attraccess/database-entities';
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
  const formRepo = { find: jest.fn(), findOne: jest.fn() };
  const resourceRepo = { findOne: jest.fn() };

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
    resourceRepo.findOne.mockResolvedValue({ id: 5 } as Resource);
    formRepo.findOne.mockResolvedValue(form);
    formRepo.find.mockResolvedValue([form]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFormsService,
        { provide: getRepositoryToken(Form), useValue: formRepo },
        { provide: getRepositoryToken(FormField), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(FormSubmission), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
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
  });

  it('rejects a non-numeric number field', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 12, value: 'abc' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(12);
  });

  it('rejects an unchecked required boolean', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 13, value: false }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(13);
  });

  it('rejects a select value outside the configured options', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 14, value: 'green' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(14);
  });

  it('accepts an in-range select value', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 14, value: 'blue' }]);
    expect(result.valid).toBe(true);
  });

  it('flags an unknown field id', async () => {
    const result = await service.validatePageAnswers(5, 7, [{ fieldId: 999, value: 'x' }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].fieldId).toBe(999);
  });
});
