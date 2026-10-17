import type { Form, FormField, FormSubmission, FormSubmissionDraft, Resource } from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';

export type FormActionColumn =
  'isRequiredOnResourceUsageStart' | 'isRequiredOnResourceUsageTakeOver' | 'isRequiredOnResourceUsageEnd';
export type FormWrite = Pick<Form, 'resourceId' | 'name' | FormActionColumn>;
export type FormFieldWrite = Pick<FormField, 'name' | 'type' | 'isRequired' | 'description' | 'options' | 'position'>;
export type { FormSubmissionDraft } from '@attraccess/application-models';

/** Stored form facts and mutations; validation and field reconciliation stay in the application. */
export abstract class FormsPersistence {
  abstract resource(resourceId: number): Promise<Resource | null>;
  abstract list(resourceId: number): Promise<Form[]>;
  abstract required(resourceId: number, column: FormActionColumn): Promise<Form[]>;
  abstract form(resourceId: number, formId: number): Promise<Form | null>;
  abstract createForm(data: FormWrite): Promise<Form>;
  abstract updateForm(resourceId: number, formId: number, data: Omit<FormWrite, 'resourceId'>): Promise<void>;
  abstract fields(formId: number): Promise<FormField[]>;
  abstract insertFields(data: (FormFieldWrite & { formId: number })[]): Promise<void>;
  abstract insertField(data: FormFieldWrite & { formId: number }): Promise<void>;
  abstract updateField(fieldId: number, data: FormFieldWrite): Promise<void>;
  abstract deleteFields(ids: readonly number[]): Promise<void>;
  abstract saveSubmission(data: Omit<FormSubmissionDraft, 'form'>): Promise<FormSubmission>;
  abstract deleteFormData(resourceId: number, formId: number): Promise<void>;
}
export const FORM_OPERATIONS = operationToken<FormsPersistence>('resource forms', [
  'resource',
  'list',
  'required',
  'form',
  'createForm',
  'updateForm',
  'fields',
  'insertFields',
  'insertField',
  'updateField',
  'deleteFields',
  'saveSubmission',
  'deleteFormData',
]);
