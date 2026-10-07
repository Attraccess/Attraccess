import { FormFieldType } from '@attraccess/react-query-client';
import type { FieldOptions } from './types.contracts';

export const defaultFieldOptions: Record<FormFieldType, FieldOptions> = {
  [FormFieldType.TEXT]: {
    placeholder: '',
    multiline: false,
  },
  [FormFieldType.NUMBER]: {
    min: '',
    max: '',
    step: '',
  },
  [FormFieldType.SELECT]: {
    options: [],
  },
  [FormFieldType.BOOLEAN]: {
    trueLabel: '',
    falseLabel: '',
  },
};
