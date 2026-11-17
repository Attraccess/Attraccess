import type { FormFieldType, FormRecord, ResourceFormAction } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_FORM_STORE = Symbol.for('attraccess.resources.form-store');

export interface FormFieldInput {
  name: string;
  type: FormFieldType;
  isRequired: boolean;
  description: string | null;
  options: Record<string, unknown> | string[] | null;
  position: number;
}

export interface FormInput {
  name: string;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
}

/** A field of an update: an existing one (with its id) is changed, one without an id is added. */
export type FormFieldUpdate = FormFieldInput & { id?: number };

export type FormUpdateResult =
  { status: 'updated'; form: FormRecord } | { status: 'form-missing' } | { status: 'field-missing'; fieldId: number };

/** Forms of resources, their fields and the lookups the usage lifecycle needs. */
export interface ResourceFormStore {
  resourceExists(resourceId: number): Promise<boolean>;

  /** Forms of a resource ordered by name, then creation. */
  listForResource(resourceId: number): Promise<FormRecord[]>;

  findForm(resourceId: number, formId: number, context?: ResourcePersistenceContext): Promise<FormRecord | null>;

  /** The forms a usage action requires, oldest first, with their fields ordered by position. */
  findRequiredForAction(
    resourceId: number,
    action: ResourceFormAction,
    context?: ResourcePersistenceContext,
  ): Promise<FormRecord[]>;

  /** Stores the form and its fields together. */
  createForm(resourceId: number, form: FormInput, fields: FormFieldInput[]): Promise<FormRecord>;

  /**
   * Changes the form and reconciles its fields together: fields missing from `fields` are deleted, fields with an id
   * are changed (an id that is not a field of this form changes nothing at all), fields without one are added.
   */
  updateForm(resourceId: number, formId: number, form: FormInput, fields: FormFieldUpdate[]): Promise<FormUpdateResult>;

  /** Deletes the form with its submissions and fields together. False when the form does not exist. */
  deleteForm(resourceId: number, formId: number): Promise<boolean>;
}
