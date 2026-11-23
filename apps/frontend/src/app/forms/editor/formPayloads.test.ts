import { FormFieldType } from '@attraccess/react-query-client';
import { describe, expect, it } from 'vitest';
import type { EditableForm, EditableFormField } from '../types';
import { EMPTY_FORM, hasValidImageFields } from './formPayloads';

const imageField = (maxImages: number | ''): EditableFormField => ({
  name: 'Photo',
  type: FormFieldType.IMAGE,
  isRequired: false,
  options: { maxImages },
});
const formWith = (...fields: EditableFormField[]): EditableForm => ({ ...EMPTY_FORM, fields });

describe('hasValidImageFields', () => {
  it('accepts whole numbers from 1 to 10 and forms without image fields', () => {
    expect(hasValidImageFields(formWith())).toBe(true);
    expect(hasValidImageFields(formWith(imageField(1), imageField(10)))).toBe(true);
    expect(
      hasValidImageFields(formWith({ name: 'Note', type: FormFieldType.TEXT, isRequired: false, options: {} })),
    ).toBe(true);
  });

  it.each<number | ''>([0, 11, -1, 1.5, ''])('blocks saving with max images %s', (maxImages) => {
    expect(hasValidImageFields(formWith(imageField(1), imageField(maxImages)))).toBe(false);
  });
});
