import type { FormFieldType } from './form';

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

/** A form of a resource with its fields. */
export interface FormRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
  resourceId: number;
  fields: FormFieldRecord[];
}
