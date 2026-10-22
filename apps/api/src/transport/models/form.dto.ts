import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { User } from './user.dto';
import { ResourceUsage } from './resourceUsage.dto';
import { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class Form {
  @ApiProperty({ description: 'The ID of the form' })
  id!: number;

  @ApiProperty({ description: 'The date and time the form was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the form was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The name of the form' })
  name!: string;

  @ApiProperty({ description: 'Whether the form is required on resource usage start' })
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({ description: 'Whether the form is required on resource usage take over' })
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({ description: 'Whether the form is required on resource usage end' })
  isRequiredOnResourceUsageEnd!: boolean;

  @ApiProperty({ description: 'The fields of the form', type: () => FormField, isArray: true })
  fields!: FormField[];

  @ApiProperty({ description: 'The submissions of the form', type: () => FormSubmission, isArray: true })
  submissions!: FormSubmission[];

  @ApiProperty({ description: 'The ID of the resource that the form belongs to' })
  resourceId!: number;

  @ApiProperty({ description: 'The resource that the form belongs to', type: () => Resource })
  resource!: Resource;
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    name: null,
    isRequiredOnResourceUsageStart: null,
    isRequiredOnResourceUsageTakeOver: null,
    isRequiredOnResourceUsageEnd: null,
    fields: () => FormField,
    submissions: () => FormSubmission,
    resourceId: null,
    resource: () => Resource,
  };
}

export class FormField {
  @ApiProperty({ description: 'The ID of the form field' })
  id!: number;

  @ApiProperty({ description: 'The ID of the form that the field belongs to' })
  formId!: number;

  @ApiProperty({ description: 'The form that the field belongs to', type: () => Form })
  form!: Form;

  @ApiProperty({ description: 'The name of the form field' })
  name!: string;

  @ApiProperty({ description: 'The type of the form field', enum: FormFieldType, enumName: 'FormFieldType' })
  type!: FormFieldType;

  @ApiProperty({ description: 'Whether the form field is required' })
  isRequired!: boolean;

  @ApiProperty({ description: 'The description of the form field' })
  description!: string | null;

  @ApiProperty({ description: 'Position of the field within the form' })
  position!: number;

  @ApiProperty({ description: 'The options of the form field' })
  options!: Record<string, unknown> | string[] | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    formId: null,
    form: () => Form,
    name: null,
    type: null,
    isRequired: null,
    description: null,
    position: null,
    options: null,
  };
}

interface FormSubmissionFieldData {
  value: string;
  fieldDefinition: FormField;
}

type FormSubmissionData = Record<string, FormSubmissionFieldData>;

export class FormSubmission {
  @ApiProperty({ description: 'The ID of the form submission' })
  id!: number;

  @ApiProperty({ description: 'The ID of the form that the submission belongs to' })
  formId!: number;

  @ApiProperty({ description: 'The form that the submission belongs to', type: () => Form })
  form!: Form;

  @ApiProperty({
    description: 'The data of the form submission',
  })
  data!: FormSubmissionData;

  @ApiProperty({ description: 'The date and time the submission was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the submission was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the user that submitted the form' })
  userId!: number;

  @ApiProperty({ description: 'The user that submitted the form', type: () => User })
  user!: User;

  @ApiProperty({ description: 'The ID of the resource usage that the submission belongs to' })
  resourceUsageId!: number;

  @ApiProperty({ description: 'The resource usage that the submission belongs to', type: () => ResourceUsage })
  resourceUsage!: ResourceUsage;

  @ApiProperty({ description: 'The action that triggered the submission', enum: ResourceFormAction })
  action!: ResourceFormAction;
  static readonly responseFields: ResponseFields = {
    id: null,
    formId: null,
    form: () => Form,
    data: null,
    createdAt: null,
    updatedAt: null,
    userId: null,
    user: () => User,
    resourceUsageId: null,
    resourceUsage: () => ResourceUsage,
    action: null,
  };
}

export { FormFieldType, ResourceFormAction } from '@attraccess/application-models';
