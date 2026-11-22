import { BadRequestException } from '@nestjs/common';
import { FormFieldType } from '@attraccess/application-models';
import { isEmptyAnswer, parseFieldOptions, parseFieldValue } from './forms.validation';

const ID_A = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('forms.validation', () => {
  describe('parseFieldOptions', () => {
    it('normalizes text options', () => {
      expect(parseFieldOptions(FormFieldType.TEXT, { placeholder: '  Label  ', multiline: true })).toEqual({
        placeholder: 'Label',
        multiline: true,
      });
    });

    it('returns null when no relevant options are provided', () => {
      expect(parseFieldOptions(FormFieldType.TEXT, {})).toBeNull();
    });

    it('validates numeric option ordering', () => {
      expect(() => parseFieldOptions(FormFieldType.NUMBER, { min: '10', max: '5' })).toThrow(
        new BadRequestException('Number field min option cannot be greater than max.'),
      );
    });

    it('parses select options as trimmed unique values', () => {
      expect(parseFieldOptions(FormFieldType.SELECT, ['  A  ', 'B', 'A'])).toEqual(['A', 'B']);
    });

    it('throws when select options are missing', () => {
      expect(() => parseFieldOptions(FormFieldType.SELECT, [])).toThrow(BadRequestException);
    });
  });

  describe('image fields', () => {
    it.each([undefined, null, {}])('gives one image when the options are %p', (options) => {
      expect(parseFieldOptions(FormFieldType.IMAGE, options)).toEqual({ maxImages: 1 });
    });

    it('keeps maxImages from 1 to 10, also sent as a numeric string', () => {
      expect(parseFieldOptions(FormFieldType.IMAGE, { maxImages: 10 })).toEqual({ maxImages: 10 });
      expect(parseFieldOptions(FormFieldType.IMAGE, { maxImages: '3' })).toEqual({ maxImages: 3 });
    });

    it.each([0, 11, 1.5, 'many', -1])('rejects maxImages %p', (maxImages) => {
      expect(() => parseFieldOptions(FormFieldType.IMAGE, { maxImages })).toThrow(BadRequestException);
    });

    it('stores the answer as the JSON text of the id list, whether it came as a list or as that text', () => {
      const stored = JSON.stringify([ID_A, ID_B]);
      expect(parseFieldValue(FormFieldType.IMAGE, [ID_A, ID_B], { maxImages: 2 })).toBe(stored);
      expect(parseFieldValue(FormFieldType.IMAGE, stored, { maxImages: 2 })).toBe(stored);
    });

    it('rejects more images than the field accepts, repeated ids and anything but ids', () => {
      expect(() => parseFieldValue(FormFieldType.IMAGE, [ID_A, ID_B], { maxImages: 1 })).toThrow(
        new BadRequestException('Image field accepts at most 1 image.'),
      );
      expect(() => parseFieldValue(FormFieldType.IMAGE, [ID_A, ID_A], { maxImages: 3 })).toThrow(BadRequestException);
      expect(() => parseFieldValue(FormFieldType.IMAGE, ['../etc/passwd'], { maxImages: 3 })).toThrow(
        BadRequestException,
      );
      expect(() => parseFieldValue(FormFieldType.IMAGE, 'photo', { maxImages: 3 })).toThrow(BadRequestException);
      expect(() => parseFieldValue(FormFieldType.IMAGE, { id: ID_A }, { maxImages: 3 })).toThrow(BadRequestException);
    });

    it('treats a field without options as accepting one image', () => {
      expect(() => parseFieldValue(FormFieldType.IMAGE, [ID_A, ID_B], null)).toThrow(BadRequestException);
    });

    it('counts an empty list as no value', () => {
      expect(isEmptyAnswer([])).toBe(true);
      expect(isEmptyAnswer('[]')).toBe(true);
      expect(isEmptyAnswer(undefined)).toBe(true);
      expect(isEmptyAnswer([ID_A])).toBe(false);
      expect(isEmptyAnswer(0)).toBe(false);
    });
  });

  describe('parseFieldValue', () => {
    it('parses numeric values from strings', () => {
      expect(parseFieldValue(FormFieldType.NUMBER, '42')).toBe('42');
    });

    it('normalizes boolean values', () => {
      expect(parseFieldValue(FormFieldType.BOOLEAN, false)).toBe('false');
      expect(parseFieldValue(FormFieldType.BOOLEAN, 'true')).toBe('true');
    });

    it('requires select values to match configured options', () => {
      expect(() => parseFieldValue(FormFieldType.SELECT, 'X', ['A', 'B'])).toThrow(
        new BadRequestException('Select field values must match one of the available options.'),
      );
      expect(parseFieldValue(FormFieldType.SELECT, 'A', ['A', 'B'])).toBe('A');
    });
  });
});
