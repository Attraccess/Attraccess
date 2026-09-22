import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Form,
  FormField,
  FormFieldType,
  FormSubmission,
  Resource,
  ResourceFormAction,
} from '@attraccess/database-entities';
import { ResourceFormsService } from './forms.service';
import { EntityManager } from 'typeorm';

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

  it('validates lifecycle form drafts without publishing submissions', async () => {
    const save = jest.fn();
    const manager = {
      getRepository: jest.fn((entity) => (entity === Form ? formRepo : { save })),
    } as unknown as EntityManager;
    const drafts = await service.prepareRequiredSubmissions({
      resourceId: 5,
      action: ResourceFormAction.START,
      userId: 3,
      resourceUsageId: 9,
      manager,
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
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ resourceUsageId: 9, userId: 3, formId: 7 });
    expect(drafts[0].data['11'].value).toBe('Alice');
    expect(save).not.toHaveBeenCalled();
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
    const fieldRepo = {
      find: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
      delete: jest.fn(),
      update: jest.fn(),
      insert: jest.fn(),
    };
    const formRepo = {
      findOne: jest.fn().mockResolvedValue(form),
      update: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    const manager = { getRepository: (entity: unknown) => (entity === Form ? formRepo : fieldRepo) };
    formRepo.manager.transaction.mockImplementation((run) => run(manager));
    const service = new ResourceFormsService(
      formRepo as never,
      fieldRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ id: 5 }) } as never,
    );
    return { service, fieldRepo, formRepo };
  };

  it('reconciles retained, deleted and new fields within the form transaction', async () => {
    const { service, fieldRepo, formRepo } = makeService();
    const updated = await service.update(5, 7, {
      ...defaults,
      name: 'Updated',
      fields: [
        { id: 11, name: 'Retained', type: FormFieldType.TEXT, position: 0, isRequired: true },
        { name: 'New', type: FormFieldType.BOOLEAN, position: 1, isRequired: false },
      ],
    });
    expect(updated.name).toBe('Updated');
    expect(formRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(fieldRepo.delete).toHaveBeenCalledWith([12]);
    expect(fieldRepo.update).toHaveBeenCalledWith(11, expect.objectContaining({ name: 'Retained', isRequired: true }));
    expect(fieldRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ formId: 7, name: 'New' }));
  });

  it('rejects an existing field belonging to a different form', async () => {
    const { service, fieldRepo } = makeService();
    await expect(
      service.update(5, 7, {
        ...defaults,
        fields: [{ id: 99, name: 'Foreign', type: FormFieldType.TEXT, position: 0, isRequired: false }],
      }),
    ).rejects.toThrow('Form field #99 not found on this form');
    expect(fieldRepo.update).not.toHaveBeenCalled();
    expect(fieldRepo.insert).not.toHaveBeenCalled();
  });

  it('removes all fields when the update supplies an empty field list', async () => {
    const { service, fieldRepo } = makeService();
    await service.update(5, 7, { ...defaults, fields: [] });
    expect(fieldRepo.delete).toHaveBeenCalledWith([11, 12]);
    expect(fieldRepo.update).not.toHaveBeenCalled();
  });
});
