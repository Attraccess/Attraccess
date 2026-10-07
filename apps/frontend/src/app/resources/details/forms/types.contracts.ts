import { FormFieldType } from '@attraccess/react-query-client';
export interface BooleanFieldOptions {
  trueLabel?: string;
  falseLabel?: string;
}
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
export type ResourceFormAction = 'start' | 'takeover' | 'end';
