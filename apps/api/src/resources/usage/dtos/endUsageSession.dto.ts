import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDate, IsArray, IsInt, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionRequestDto } from '../../forms/dto';
import { CreateMaintenanceRequestDto } from '../../maintenances/dtos/create-maintenance-request.dto';

export class EndUsageSessionDto {
  @ApiProperty({
    description:
      'Id of the session to end. If omitted, your own session is ended. On a machine that allows only one session, the single running session may also be ended without an id (for example by a manager); on a machine with several sessions this fails with NoOwnActiveSessionError.',
    required: false,
    type: Number,
  })
  @IsInt()
  @IsOptional()
  usageId?: number;

  @ApiProperty({
    description: 'Additional notes about the completed session',
    required: false,
    example: 'Print completed successfully',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    description: 'The end time of the session. If not provided, current time will be used.',
    required: false,
    type: Date,
  })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  endTime?: Date;

  @ApiProperty({
    description: 'Form submissions associated with ending the usage session',
    required: false,
    type: () => FormSubmissionRequestDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSubmissionRequestDto)
  formSubmissions?: FormSubmissionRequestDto[];

  @ApiProperty({
    description:
      'Files a maintenance request for the resource, by the user ending the session, once the session ended. Nothing is filed when the end fails or without the maintenance license module; a failed filing does not fail the end (see `maintenanceRequestFiled`).',
    required: false,
    type: () => CreateMaintenanceRequestDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMaintenanceRequestDto)
  maintenanceRequest?: CreateMaintenanceRequestDto;
}
