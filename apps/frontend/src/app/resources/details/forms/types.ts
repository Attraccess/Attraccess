import { FormFieldResponseDto, FormFieldType } from '@attraccess/react-query-client';

export type ResourceFormAction = 'start' | 'takeover' | 'end';

export interface TextFieldOptions {
  placeholder?: string;
  multiline?: boolean;
}

export interface NumberFieldOptions {
  min?: number | '';
  max?: number | '';
  step?: number | '';
}

export interface SelectFieldOptions {
  options: string[];
}

export interface BooleanFieldOptions {
  trueLabel?: string;
  falseLabel?: string;
}

export type FieldOptions = TextFieldOptions | NumberFieldOptions | SelectFieldOptions | BooleanFieldOptions;

export interface EditableFormField {
  id?: number;
  _id?: string;
  name: string;
  type: FormFieldType;
  isRequired: boolean;
  description?: string | null;
  options: FieldOptions;
}

export interface EditableForm {
  name: string;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
  fields: EditableFormField[];
}

const defaultFieldOptions: Record<FormFieldType, FieldOptions> = {
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

export function createDefaultFieldOptions(type: FormFieldType): FieldOptions {
  const template = defaultFieldOptions[type];
  return template ? { ...template } : {};
}

export function parseFieldOptions(type: FormFieldType, raw?: Record<string, unknown> | string[] | null): FieldOptions {
  const options = createDefaultFieldOptions(type);
  if (!raw) {
    return options;
  }

  switch (type) {
    case FormFieldType.TEXT: {
      const textOptions = options as TextFieldOptions;
      if (!Array.isArray(raw)) {
        if (typeof raw.placeholder === 'string') {
          textOptions.placeholder = raw.placeholder;
        }
        if (typeof raw.multiline === 'boolean') {
          textOptions.multiline = raw.multiline;
        }
      }
      return textOptions;
    }
    case FormFieldType.NUMBER: {
      const numberOptions = options as NumberFieldOptions;
      if (!Array.isArray(raw)) {
        if (isFiniteNumber(raw.min)) {
          numberOptions.min = Number(raw.min);
        }
        if (isFiniteNumber(raw.max)) {
          numberOptions.max = Number(raw.max);
        }
        if (isFiniteNumber(raw.step)) {
          numberOptions.step = Number(raw.step);
        }
      }
      return numberOptions;
    }
    case FormFieldType.SELECT: {
      const selectOptions = options as SelectFieldOptions;
      // SELECT options are stored as a direct array, not wrapped in an object
      if (Array.isArray(raw)) {
        selectOptions.options = raw.filter((o): o is string => typeof o === 'string');
      }
      return selectOptions;
    }
    case FormFieldType.BOOLEAN: {
      const booleanOptions = options as BooleanFieldOptions;
      if (!Array.isArray(raw)) {
        if (typeof raw.trueLabel === 'string') {
          booleanOptions.trueLabel = raw.trueLabel;
        }
        if (typeof raw.falseLabel === 'string') {
          booleanOptions.falseLabel = raw.falseLabel;
        }
      }
      return booleanOptions;
    }
    default:
      return options;
  }
}

export function serializeFieldOptions(
  type: FormFieldType,
  options: FieldOptions,
): Record<string, unknown> | string[] | null {
  switch (type) {
    case FormFieldType.TEXT: {
      const { placeholder, multiline } = options as TextFieldOptions;
      const payload: Record<string, unknown> = {};
      if (placeholder?.trim()) {
        payload.placeholder = placeholder.trim();
      }
      if (typeof multiline === 'boolean') {
        payload.multiline = multiline;
      }
      return Object.keys(payload).length ? payload : null;
    }
    case FormFieldType.NUMBER: {
      const { min, max, step } = options as NumberFieldOptions;
      const payload: Record<string, unknown> = {};
      if (min !== '' && min !== undefined) {
        payload.min = Number(min);
      }
      if (max !== '' && max !== undefined) {
        payload.max = Number(max);
      }
      if (step !== '' && step !== undefined) {
        payload.step = Number(step);
      }
      return Object.keys(payload).length ? payload : null;
    }
    case FormFieldType.SELECT: {
      const { options: selectOptions } = options as SelectFieldOptions;
      if (selectOptions && selectOptions.length > 0) {
        return selectOptions;
      }
      return null;
    }
    case FormFieldType.BOOLEAN: {
      const { trueLabel, falseLabel } = options as BooleanFieldOptions;
      const payload: Record<string, unknown> = {};
      if (trueLabel?.trim()) {
        payload.trueLabel = trueLabel.trim();
      }
      if (falseLabel?.trim()) {
        payload.falseLabel = falseLabel.trim();
      }
      return Object.keys(payload).length ? payload : null;
    }
    default:
      return null;
  }
}

export function parseFieldFromResponse(field: FormFieldResponseDto): EditableFormField {
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    isRequired: field.isRequired,
    description: field.description,
    options: parseFieldOptions(field.type, field.options as Record<string, unknown> | string[]),
  };
}

function isFiniteNumber(value: unknown): value is number {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value));
  }
  return false;
}
