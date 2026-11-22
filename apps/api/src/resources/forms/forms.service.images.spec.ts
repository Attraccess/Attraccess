import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  FormFieldType,
  ResourceFormAction,
  type FormFieldRecord,
  type FormRecord,
} from '@attraccess/application-models';
import { ResourceFormsService } from './forms.service';
import { InMemoryFormImageStore } from './images/form-image-store.test-fixture';

const ID_A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ID_C = '0c1d2e3f-4a5b-4c6d-8e7f-a0b1c2d3e4f5';
const USER = 5;

const field = (overrides: Partial<FormFieldRecord>): FormFieldRecord => ({
  id: 21,
  formId: 7,
  name: 'Damage photo',
  type: FormFieldType.IMAGE,
  isRequired: true,
  description: null,
  position: 0,
  options: { maxImages: 2 },
  ...overrides,
});

const form: FormRecord = {
  id: 7,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  name: 'Check-in',
  scope: 'resource',
  resourceId: 5,
  groupId: null,
  deletedAt: null,
  isRequiredOnResourceUsageStart: true,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [
    field({}),
    field({ id: 22, name: 'Note', type: FormFieldType.TEXT, isRequired: false, options: null, position: 1 }),
  ],
};

describe('ResourceFormsService image fields', () => {
  let images: InMemoryFormImageStore;
  let service: ResourceFormsService;

  const store = {
    resourceExists: jest.fn().mockResolvedValue(true),
    findResourceName: jest.fn().mockResolvedValue('Laser'),
    findRequiredForAction: jest.fn(),
  };

  const upload = async (id: string, overrides: { userId?: number; fieldId?: number; formId?: number } = {}) => {
    await images.insertImage({
      id,
      userId: overrides.userId ?? USER,
      uploadedByUserId: overrides.userId ?? USER,
      handoffId: null,
      formId: overrides.formId ?? 7,
      fieldId: overrides.fieldId ?? 21,
      mimeType: 'image/jpeg',
      size: 10,
      width: 10,
      height: 10,
      filename: `${id}.jpg`,
    });
  };

  const submit = (value: unknown, userId = USER) =>
    service.prepareRequiredSubmissions({
      resourceId: 5,
      action: ResourceFormAction.START,
      submissions: [{ formId: 7, answers: [{ fieldId: 21, value: value as string }] }],
      userId,
      resourceUsageId: 99,
    });

  beforeEach(() => {
    images = new InMemoryFormImageStore();
    store.findRequiredForAction.mockResolvedValue([form]);
    service = new ResourceFormsService(store as never, images);
  });

  describe('submitting', () => {
    it('stores the ids as a JSON list on the draft', async () => {
      await upload(ID_A);
      await upload(ID_B);

      const [draft] = await submit([ID_A, ID_B]);

      expect(draft.data['21'].value).toBe(JSON.stringify([ID_A, ID_B]));
    });

    it.each([
      ['an image of another user', () => upload(ID_A, { userId: 6 })],
      ['an image of another field', () => upload(ID_A, { fieldId: 22 })],
      ['an image of another form', () => upload(ID_A, { formId: 8 })],
      ['an unknown image', async () => undefined],
    ])('rejects %s with 400', async (_name, arrange) => {
      await arrange();
      await expect(submit([ID_A])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an image a submission already has', async () => {
      await upload(ID_A);
      (images.images.get(ID_A) as { submissionId: number }).submissionId = 3;
      await expect(submit([ID_A])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more images than the field accepts and duplicates', async () => {
      await upload(ID_A);
      await upload(ID_B);
      await upload(ID_C);
      await expect(submit([ID_A, ID_B, ID_C])).rejects.toThrow('at most 2 images');
      await expect(submit([ID_A, ID_A])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('says the same for an image that does not exist as for one of someone else', async () => {
      await upload(ID_A, { userId: 6 });
      const other = await submit([ID_A]).catch((error: Error) => error.message);
      const missing = await submit([ID_B]).catch((error: Error) => error.message);
      expect(other).toBe(missing);
    });

    it.each([[[]], ['[]'], [undefined], [null], ['']])(
      'gives the required error for the empty answer %p',
      async (value) => {
        await expect(submit(value)).rejects.toThrow('Field "Damage photo" is required');
      },
    );

    it('lets an optional image field stay empty', async () => {
      store.findRequiredForAction.mockResolvedValue([{ ...form, fields: [field({ isRequired: false })] }]);
      const [draft] = await submit([]);
      expect(draft.data).toEqual({});
    });
  });

  describe('a reader page', () => {
    beforeEach(() => {
      store.findRequiredForAction.mockResolvedValue([form]);
    });

    it('accepts usable images and gives REQUIRED_FIELD for none', async () => {
      await upload(ID_A);

      await expect(
        service.validatePageAnswers(
          5,
          ResourceFormAction.START,
          7,
          [{ fieldId: 21, value: JSON.stringify([ID_A]) }],
          USER,
        ),
      ).resolves.toEqual({ valid: true, errors: [] });
      const empty = await service.validatePageAnswers(
        5,
        ResourceFormAction.START,
        7,
        [{ fieldId: 21, value: '' }],
        USER,
      );
      expect(empty.errors).toEqual([expect.objectContaining({ fieldId: 21, code: 'REQUIRED_FIELD' })]);
    });

    it('rejects an image of someone else, and any image without a user', async () => {
      await upload(ID_A, { userId: 6 });

      const foreign = await service.validatePageAnswers(
        5,
        ResourceFormAction.START,
        7,
        [{ fieldId: 21, value: [ID_A] as never }],
        USER,
      );
      expect(foreign.errors).toEqual([expect.objectContaining({ fieldId: 21, code: 'INVALID_INPUT' })]);
      const anonymous = await service.validatePageAnswers(5, ResourceFormAction.START, 7, [
        { fieldId: 21, value: [ID_A] as never },
      ]);
      expect(anonymous.valid).toBe(false);
    });
  });

  describe('resolveImageField', () => {
    it('returns the field, its form and the resource name', async () => {
      await expect(service.resolveImageField(5, ResourceFormAction.START, 7, 21)).resolves.toMatchObject({
        form: { id: 7 },
        field: { id: 21 },
        resourceName: 'Laser',
      });
    });

    it('is 404 for a form that is not required and a field that does not exist, 400 for a field of another type', async () => {
      await expect(service.resolveImageField(5, ResourceFormAction.START, 8, 21)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.resolveImageField(5, ResourceFormAction.START, 7, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.resolveImageField(5, ResourceFormAction.START, 7, 22)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('for readers', () => {
    it('lists image fields in a window only for readers that can show them', async () => {
      store.findRequiredForAction.mockResolvedValue([form]);

      const withImages = await service.getFieldsWindow(5, ResourceFormAction.START, 7, 0, 10);
      const withoutImages = await service.getFieldsWindow(5, ResourceFormAction.START, 7, 0, 10, {
        imageFields: false,
      });

      expect(withImages.fields.map((item) => item.id)).toEqual([21, 22]);
      expect(withoutImages).toMatchObject({ totalFieldCount: 1, fields: [expect.objectContaining({ id: 22 })] });
    });
  });
});
