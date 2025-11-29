import { BadRequestException } from '@nestjs/common';
import { FormFieldType } from '@attraccess/database-entities';
import { parseFieldOptions, parseFieldValue } from './forms.validation';

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
      expect(() => parseFieldOptions(FormFieldType.NUMBER, { min: '10', max: '5' })).toThrowError(
        new BadRequestException('Number field min option cannot be greater than max.'),
      );
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

    it('rejects invalid datetime strings', () => {
      expect(() => parseFieldValue(FormFieldType.DATETIME, 'not-a-date')).toThrowError(
        new BadRequestException('Datetime field values must be valid ISO strings.'),
      );
    });
  });
});
