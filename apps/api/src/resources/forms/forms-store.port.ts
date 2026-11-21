import type {
  ApplicableFormRecord,
  FormFieldType,
  FormRecord,
  FormResourceOverrideRecord,
  FormScope,
  FormSubmissionListRecord,
  ResourceFormAction,
} from '@attraccess/application-models';
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

/** Where a form applies; the owner column the scope does not use must be null. */
export interface FormPlacement {
  scope: FormScope;
  resourceId: number | null;
  groupId: number | null;
}

export interface FormInput extends FormPlacement {
  name: string;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
}

/** A field of an update: an existing one (with its id) is changed, one without an id is added. */
export type FormFieldUpdate = FormFieldInput & { id?: number };

export type FormUpdateResult =
  { status: 'updated'; form: FormRecord } | { status: 'form-missing' } | { status: 'field-missing'; fieldId: number };

export interface FormListFilter {
  scope?: FormScope;
  resourceId?: number;
  groupId?: number;
  search?: string;
  page: number;
  limit: number;
}

/** A listed form with the number of resources it currently applies to (switched-off resources do not count). */
export interface FormListItem {
  form: FormRecord;
  appliesToResourceCount: number;
  resourceName: string | null;
  groupName: string | null;
}

/** A resource a form reaches by its scope, with that resource's override. */
export interface FormAppliedResource {
  resource: { id: number; name: string };
  override: FormResourceOverrideRecord | null;
}

/** Nullable flags inherit the form's default. */
export interface FormOverrideInput {
  disabled: boolean;
  isRequiredOnResourceUsageStart: boolean | null;
  isRequiredOnResourceUsageTakeOver: boolean | null;
  isRequiredOnResourceUsageEnd: boolean | null;
}

/**
 * Forms, their fields, per-resource overrides and submissions. Deleted forms are left out of everything but
 * {@link findFormIncludingDeleted} and {@link listSubmissions}, which serve the history.
 */
export interface ResourceFormStore {
  resourceExists(resourceId: number): Promise<boolean>;

  groupExists(groupId: number): Promise<boolean>;

  /** Live forms; resource forms of a deleted resource are inert and left out. */
  listForms(filter: FormListFilter): Promise<{ items: FormListItem[]; total: number }>;

  findForm(formId: number, context?: ResourcePersistenceContext): Promise<FormRecord | null>;

  findFormIncludingDeleted(formId: number): Promise<FormRecord | null>;

  /**
   * The forms that reach a resource by scope, switched-off ones included: global first, then group, then resource
   * forms, each by id. A form reached through several groups appears once.
   */
  findApplicableForResource(resourceId: number, context?: ResourcePersistenceContext): Promise<ApplicableFormRecord[]>;

  /** The applicable, not switched-off forms whose effective flag requires them for the action, fields by position. */
  findRequiredForAction(
    resourceId: number,
    action: ResourceFormAction,
    context?: ResourcePersistenceContext,
  ): Promise<FormRecord[]>;

  /** The resources (not deleted) a form reaches by scope, by name, with their overrides. */
  listAppliedResources(formId: number): Promise<FormAppliedResource[]>;

  /** Stores the form and its fields together. */
  createForm(form: FormInput, fields: FormFieldInput[]): Promise<FormRecord>;

  /**
   * Changes the form, its scope included, and reconciles its fields together: fields missing from `fields` are deleted,
   * fields with an id are changed (an id that is not a field of this form changes nothing at all), fields without one
   * are added. Overrides of resources the new scope no longer reaches are deleted.
   */
  updateForm(formId: number, form: FormInput, fields: FormFieldUpdate[]): Promise<FormUpdateResult>;

  /** Marks the form deleted; its fields and submissions stay. False when the form does not exist. */
  deleteForm(formId: number): Promise<boolean>;

  /**
   * Creates or changes the resource's override of the form, checked and written atomically. Null (nothing written)
   * when the form is deleted or its scope does not reach the resource.
   */
  upsertOverride(
    formId: number,
    resourceId: number,
    input: FormOverrideInput,
  ): Promise<FormResourceOverrideRecord | null>;

  /** Deletes the live forms of a resource group softly, in the caller's unit of work. The number deleted. */
  softDeleteGroupForms(groupId: number, context?: ResourcePersistenceContext): Promise<number>;

  /** False when there was no override. */
  deleteOverride(formId: number, resourceId: number): Promise<boolean>;

  /** Submissions of a form, newest first, optionally of one resource only. */
  listSubmissions(
    formId: number,
    filter: { resourceId?: number; page: number; limit: number },
  ): Promise<{ items: FormSubmissionListRecord[]; total: number }>;
}
