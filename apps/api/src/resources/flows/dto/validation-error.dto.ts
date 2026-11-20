import { ApiProperty } from '@nestjs/swagger';
import { VALIDATION_ERROR_CODES, ValidationErrorCode } from '../node-validation-errors';

export class ValidationErrorDto {
  @ApiProperty({
    description: 'The ID of the node that has the validation error',
    example: 'node-123',
  })
  nodeId: string;

  @ApiProperty({
    description: 'The type of the node that has the validation error',
    example: 'action.http.sendRequest',
  })
  nodeType: string;

  @ApiProperty({
    description: 'The field that has the validation error',
    example: 'url',
  })
  field: string;

  @ApiProperty({
    description:
      'What is wrong with the field: `required` when the value is missing (undefined, null or empty), `invalid` otherwise. Always set by this API; clients should treat a missing code as `invalid`.',
    enum: VALIDATION_ERROR_CODES,
    enumName: 'FlowValidationErrorCode',
    required: false,
    example: 'required',
  })
  code?: ValidationErrorCode;

  @ApiProperty({
    description: 'A short, plain English validation message (no JSON)',
    example: 'This field is required.',
  })
  message: string;
}
