import { ResourceFormAction } from '@attraccess/database-entities';

export type FormFieldAnswerValue = string | number | boolean;

export interface ResourceUsageFormFieldPayload {
  id: number;
  name: string;
  description: string | null;
  type: string;
  isRequired: boolean;
  options: Record<string, unknown> | string[] | null;
  value?: FormFieldAnswerValue | null;
}

export interface ResourceUsageFormMetaPayload {
  id: number;
  name: string;
  fieldCount: number;
}

export interface ResourceUsageFormRequestPayload {
  requestId?: number;
  resourceId: number;
  resourceName?: string;
  action: ResourceFormAction;
  forms: ResourceUsageFormMetaPayload[];
}

export interface ResourceUsageFormGetFieldsPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  limit: number;
}

export interface ResourceUsageFormFieldsPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  totalFieldCount: number;
  fields: ResourceUsageFormFieldPayload[];
}

export interface ResourceUsageFormSubmitPagePayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  answers: { fieldId: number; value: FormFieldAnswerValue }[];
}

export interface ResourceUsageFormCancelPayload {
  resourceId: number;
  action: ResourceFormAction;
}

export interface ResourceUsageFormPageErrorPayload {
  fieldId: number;
  message: string;
}

export interface ResourceUsageFormPageResultPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  valid: boolean;
  errors: ResourceUsageFormPageErrorPayload[];
}
