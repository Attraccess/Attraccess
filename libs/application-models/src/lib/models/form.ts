import { Resource } from './resource';
import { User } from './user';
import { ResourceUsage } from './resourceUsage';

export enum FormFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
}

export enum ResourceFormAction {
  START = 'start',
  TAKEOVER = 'takeover',
  END = 'end',
}

export interface Form {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  isRequiredOnResourceUsageStart: boolean;
  isRequiredOnResourceUsageTakeOver: boolean;
  isRequiredOnResourceUsageEnd: boolean;
  fields: FormField[];
  submissions: FormSubmission[];
  resourceId: number;
  resource: Resource;
}

export interface FormField {
  id: number;
  formId: number;
  form: Form;
  name: string;
  type: FormFieldType;
  isRequired: boolean;
  description: string | null;
  position: number;
  options: Record<string, unknown> | string[] | null;
}

interface FormSubmissionFieldData {
  value: string;
  fieldDefinition: FormField;
}

type FormSubmissionData = Record<string, FormSubmissionFieldData>;

export interface FormSubmission {
  id: number;
  formId: number;
  form: Form;
  data: FormSubmissionData;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  user: User;
  resourceUsageId: number;
  resourceUsage: ResourceUsage;
  action: ResourceFormAction;
}

/** Validated lifecycle snapshot, before persistence assigns identifiers and timestamps. */
export type FormSubmissionDraft = Pick<
  FormSubmission,
  'formId' | 'form' | 'resourceUsageId' | 'userId' | 'data' | 'action'
>;
