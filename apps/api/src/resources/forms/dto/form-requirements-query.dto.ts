import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ResourceFormAction } from '@attraccess/database-entities';

export class FormRequirementsQueryDto {
  @ApiProperty({
    description: 'Usage action the forms are required for',
    enum: ResourceFormAction,
  })
  @IsEnum(ResourceFormAction)
  action!: ResourceFormAction;
}

