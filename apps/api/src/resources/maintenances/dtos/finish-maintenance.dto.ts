import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class FinishMaintenanceDto {
  @ApiProperty({
    description: 'Optional notes when marking the maintenance as done',
    example: 'Replaced filter, cleaned nozzle',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
