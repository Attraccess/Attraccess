import type { FormFieldType, FormScope, ResourceFormAction } from './form';

export interface FormFieldRecord {
  id: number;
  formId: number;
  name: string;
  type: FormFieldType;
  isRequired: boolean;
  description: string | null;
  position: number;
  options: Record<string, unknown> | string[] | null;
}

/**
 * A form with its fields. `scope` says where it applies: `resource` (then `resourceId` is set), `group` (then `groupId`
 * is set) or `global` (neither). The three required flags are defaults that a resource can override.
 */
export interface FormRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  scope: FormScope;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
  resourceId: number | null;
  groupId: number | null;
  /** Set when the form was deleted; deleted forms only stay for the history of their submissions. */
  deletedAt: Date | null;
  fields: FormFieldRecord[];
}

/** The required flags a form or an override carries, one per usage action. */
export interface FormRequiredFlags {
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
}

/** How one resource deviates from a form that applies to it. A `null` flag inherits the form's default. */
export interface FormResourceOverrideRecord {
  id: number;
  formId: number;
  resourceId: number;
  disabled: boolean;
  isRequiredOnResourceUsageStart: boolean | null;
  isRequiredOnResourceUsageTakeOver: boolean | null;
  isRequiredOnResourceUsageEnd: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A form as it applies to one resource: where it comes from, the override and the resulting flags. */
export interface ApplicableFormRecord {
  form: FormRecord;
  /** The name of the group the form comes from, for group forms. */
  groupName: string | null;
  override: FormResourceOverrideRecord | null;
  disabled: boolean;
  effective: FormRequiredFlags;
}

/** A submission of a form with the resource it was given for. */
export interface FormSubmissionListRecord {
  id: number;
  createdAt: Date;
  formId: number;
  action: ResourceFormAction;
  user: { id: number; username: string } | null;
  resource: { id: number; name: string } | null;
  data: Record<string, { value: string; fieldDefinition: FormFieldRecord }>;
}

/** The override's flag where it sets one, the form's default otherwise. */
export function effectiveFormFlags(
  form: FormRequiredFlags,
  override: Pick<
    FormResourceOverrideRecord,
    'isRequiredOnResourceUsageStart' | 'isRequiredOnResourceUsageTakeOver' | 'isRequiredOnResourceUsageEnd'
  > | null,
): FormRequiredFlags {
  return {
    isRequiredOnResourceUsageStart: override?.isRequiredOnResourceUsageStart ?? form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver:
      override?.isRequiredOnResourceUsageTakeOver ?? form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: override?.isRequiredOnResourceUsageEnd ?? form.isRequiredOnResourceUsageEnd,
  };
}
