import { ResourceFormAction } from '@attraccess/application-models';
import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';

const ref = (schema: string) => ({ allOf: [{ $ref: getSchemaPath(schema) }] });

/**
 * The `FormSubmission` schema of the published API description. Usage sessions refer to it by name (their
 * `formSubmissions`); the usage export registers it, as the stored entity used to.
 */
@ApiSchema({ name: 'FormSubmission' })
export class FormSubmissionSchemaDto {
  @ApiProperty({ description: 'The ID of the form submission' })
  id!: number;

  @ApiProperty({ description: 'The ID of the form that the submission belongs to' })
  formId!: number;

  @ApiProperty({ description: 'The form that the submission belongs to', ...ref('Form') })
  form!: object;

  @ApiProperty({ description: 'The data of the form submission', type: Object })
  data!: Record<string, unknown>;

  @ApiProperty({ description: 'The date and time the submission was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the submission was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The ID of the user that submitted the form' })
  userId!: number;

  @ApiProperty({ description: 'The user that submitted the form', ...ref('User') })
  user!: object;

  @ApiProperty({ description: 'The ID of the resource usage that the submission belongs to' })
  resourceUsageId!: number;

  @ApiProperty({ description: 'The resource usage that the submission belongs to', ...ref('ResourceUsage') })
  resourceUsage!: object;

  @ApiProperty({ description: 'The action that triggered the submission', enum: ResourceFormAction })
  action!: ResourceFormAction;
}
